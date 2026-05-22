import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { CHIP_GROUPS, CREW_MODULE_KEYS, permToChip, type ChipLevel, type PermissionLevel } from '../lib/presets';
import { derivePreset, type UserPermMap } from '../lib/derivePreset';
import type { AccessPreset } from '../lib/presets';

export interface UserAccessRow {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  position: string | null;
  status: 'active' | 'inactive';
  preset: AccessPreset;
  chips: Array<{ label: string; level: ChipLevel }>;
}

export function useUsersWithAccess() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    enabled: !!companyId,
    queryKey: ['users-access', 'list', companyId],
    queryFn: async (): Promise<UserAccessRow[]> => {
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email')
        .eq('company_id', companyId!)
        .order('first_name');
      if (pErr) throw pErr;
      if (!profiles?.length) return [];

      const userIds = profiles.map((p) => p.user_id);

      const [{ data: assignments }, { data: overrides }] = await Promise.all([
        supabase
          .from('crew_assignments')
          .select('user_id, position, is_current')
          .in('user_id', userIds)
          .eq('is_current', true),
        supabase
          .from('user_permission_overrides')
          .select('user_id, module_key, permission, is_granted')
          .in('user_id', userIds)
          .eq('is_granted', true),
      ]);

      const posMap = new Map<string, string>();
      (assignments ?? []).forEach((a) => posMap.set(a.user_id, a.position ?? ''));

      const permByUser = new Map<string, UserPermMap>();
      (overrides ?? []).forEach((o) => {
        const map = permByUser.get(o.user_id) ?? {};
        // Keep the highest permission seen per module.
        const current = map[o.module_key];
        const rank = (p?: PermissionLevel | null) => (p === 'admin' ? 3 : p === 'edit' ? 2 : p === 'view' ? 1 : 0);
        if (rank(o.permission as PermissionLevel) > rank(current)) {
          map[o.module_key] = o.permission as PermissionLevel;
        }
        permByUser.set(o.user_id, map);
      });

      return profiles.map((p) => {
        const perms = permByUser.get(p.user_id) ?? {};
        return {
          userId: p.user_id,
          firstName: p.first_name ?? '',
          lastName: p.last_name ?? '',
          email: p.email ?? '',
          position: posMap.get(p.user_id) ?? null,
          status: 'active' as const,
          preset: derivePreset(perms),
          chips: CHIP_GROUPS.map((g) => ({
            label: g.label,
            level: permToChip(perms[g.moduleKey] ?? null),
          })),
        };
      });
    },
  });
}