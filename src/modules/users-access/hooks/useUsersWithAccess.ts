import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { CHIP_GROUPS, permToChip, type ChipLevel, type PermissionLevel } from '../lib/presets';
import { derivePreset, type UserPermMap } from '../lib/derivePreset';
import type { AccessPreset } from '../lib/presets';
import { accountStateOf, type AccountState } from '../lib/invitationStatus';

export interface UserAccessRow {
  /** `profiles.id`: every person, with or without a login. */
  profileId: string;
  /** The login; null for imported crew who have not joined yet. */
  userId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  position: string | null;
  /** From `profiles.account_status` and the login (never assumed active). */
  account: AccountState;
  preset: AccessPreset;
  chips: Array<{ label: string; level: ChipLevel }>;
}

const rank = (p?: PermissionLevel | null) => (p === 'admin' ? 3 : p === 'edit' ? 2 : p === 'view' ? 1 : 0);

export const usersAccessKeys = {
  list: (companyId: string | null | undefined) => ['users-access', 'list', companyId ?? null] as const,
  invitations: (companyId: string | null | undefined, profileIds: readonly string[]) =>
    ['users-access', 'invitations', companyId ?? null, [...profileIds].sort().join(',')] as const,
};

export function useUsersWithAccess() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    enabled: !!companyId,
    queryKey: usersAccessKeys.list(companyId),
    queryFn: async (): Promise<UserAccessRow[]> => {
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, user_id, first_name, last_name, email, account_status')
        .eq('company_id', companyId!)
        .order('first_name');
      if (pErr) throw pErr;
      if (!profiles?.length) return [];

      const userIds = profiles.map((p) => p.user_id).filter((id): id is string => Boolean(id));

      const [assignments, overrides] = userIds.length
        ? await Promise.all([
            supabase.from('crew_assignments').select('user_id, position, is_current').in('user_id', userIds).eq('is_current', true),
            supabase.from('user_permission_overrides').select('user_id, module_key, permission, is_granted').in('user_id', userIds).eq('is_granted', true),
          ])
        : [{ data: [], error: null }, { data: [], error: null }];
      // A failed read is an error, not "no position" or "no access" (fail closed).
      if (assignments.error) throw assignments.error;
      if (overrides.error) throw overrides.error;

      const posMap = new Map<string, string>();
      (assignments.data ?? []).forEach((a) => posMap.set(a.user_id, a.position ?? ''));

      const permByUser = new Map<string, UserPermMap>();
      (overrides.data ?? []).forEach((o) => {
        const map = permByUser.get(o.user_id) ?? {};
        // Keep the highest permission seen per module.
        if (rank(o.permission as PermissionLevel) > rank(map[o.module_key])) map[o.module_key] = o.permission as PermissionLevel;
        permByUser.set(o.user_id, map);
      });

      return profiles.map((p) => {
        const perms = (p.user_id && permByUser.get(p.user_id)) || {};
        return {
          profileId: p.id,
          userId: p.user_id ?? null,
          firstName: p.first_name ?? '',
          lastName: p.last_name ?? '',
          email: p.email ?? '',
          position: (p.user_id && posMap.get(p.user_id)) || null,
          account: accountStateOf(p.account_status, Boolean(p.user_id)),
          preset: derivePreset(perms),
          chips: CHIP_GROUPS.map((g) => ({ label: g.label, level: permToChip(perms[g.moduleKey] ?? null) })),
        };
      });
    },
  });
}
