import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PermissionLevel } from '../lib/presets';
import { accountStateOf, type AccountState } from '../lib/invitationStatus';
import { highestPermissionByModule } from '../lib/permissionRank';

export interface AccessDetail {
  profileId: string;
  companyId: string | null;
  account: AccountState;
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
      const { data: prof, error } = await supabase
        .from('profiles')
        .select('id, company_id, account_status, user_id, first_name, last_name, email')
        .eq('user_id', userId!)
        .maybeSingle();
      // A failed read is an error state, not "not found" (fail closed).
      if (error) throw error;
      if (!prof) return null;

      const [assignmentRes, overridesRes, rolesRes] = await Promise.all([
        // Several current rows are valid (one per vessel): the most recent join shows.
        supabase
          .from('crew_assignments')
          .select('position')
          .eq('user_id', userId!)
          .eq('is_current', true)
          .order('join_date', { ascending: false })
          .limit(1),
        supabase
          .from('user_permission_overrides')
          .select('module_key, permission, is_granted')
          .eq('user_id', userId!)
          .eq('is_granted', true),
        supabase.rpc('get_user_roles_full', { p_user_id: userId! }),
      ]);
      // A failed read is an error state, not "no access" (fail closed, D-04): the
      // page shows PageError with Retry instead of a matrix of "None".
      if (assignmentRes.error) throw assignmentRes.error;
      if (overridesRes.error) throw overridesRes.error;
      if (rolesRes.error) throw rolesRes.error;
      const assignment = assignmentRes.data?.[0] ?? null;

      // Duplicate rows for a module: the highest one applies, so it is the one shown (as on the list).
      const permissions: Record<string, PermissionLevel | null> = highestPermissionByModule(overridesRes.data ?? []);

      const roleDisplayName = (rolesRes.data ?? [])[0]?.role_display_name ?? null;

      return {
        profileId: prof.id,
        companyId: prof.company_id ?? null,
        account: accountStateOf(prof.account_status, true),
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