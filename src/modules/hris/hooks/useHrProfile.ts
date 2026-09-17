import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json, Tables, TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { HR_CREW_DIRECTORY_KEY } from '@/modules/hris/hooks/useHrCrewDirectory';
import { avatarStoragePath, validateAvatarFile } from '@/modules/hris/lib/profileForm';

export type HrProfile = Tables<'profiles'>;

export const HR_PROFILE_KEY = ['hris', 'profile'] as const;
export const HR_PROFILE_AUDIT_KEY = ['hris', 'profile-audit'] as const;

/**
 * audit_logs.entity_type values that describe a profile change. The legacy
 * crew module writes `crew_profile` keyed on the user_id; HRIS writes
 * `crew_profile` keyed on profiles.id (the HRIS employee key, which also
 * exists for imported crew without a login).
 */
export const PROFILE_AUDIT_ENTITY_TYPES = ['crew_profile', 'profile', 'crew_member'] as const;

/** Single profile row by `profiles.id` (the HRIS employee key). */
export function useHrProfile(profileId: string | null | undefined) {
  return useQuery({
    queryKey: [...HR_PROFILE_KEY, profileId ?? null],
    enabled: Boolean(profileId),
    staleTime: 30_000,
    queryFn: async (): Promise<HrProfile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', profileId as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export interface UpdateHrProfileInput {
  profileId: string;
  /** snake_case columns to write. Empty patch is a no-op. */
  patch: TablesUpdate<'profiles'>;
  /** Values before the change (same keys as `patch`), used for the audit entry. */
  previous?: Partial<Record<keyof TablesUpdate<'profiles'>, string | null>>;
}

/**
 * Update a profile by `profiles.id`. RLS decides whether the row can be
 * written (HR editors for anyone in the company, users for their own row);
 * a zero-row update is surfaced as an error rather than a silent success.
 */
export function useUpdateHrProfile() {
  const queryClient = useQueryClient();
  const { user, profile: me } = useAuth();

  return useMutation({
    mutationFn: async ({ profileId, patch, previous }: UpdateHrProfileInput): Promise<HrProfile> => {
      const columns = Object.keys(patch);
      if (columns.length === 0) {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', profileId).single();
        if (error) throw error;
        return data;
      }

      const { data, error } = await supabase
        .from('profiles')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', profileId)
        .select('*');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('No changes were saved. You may not have permission to edit this record.');
      }

      await writeProfileAudit({
        profileId,
        actorUserId: user?.id ?? null,
        actorEmail: me?.email ?? null,
        actorRole: me?.role ?? null,
        changedColumns: columns,
        oldValues: previous ?? {},
        newValues: patch as Record<string, Json>,
      });

      return data[0];
    },
    onSuccess: (row) => {
      queryClient.setQueryData([...HR_PROFILE_KEY, row.id], row);
      queryClient.invalidateQueries({ queryKey: ['crew'] });
      queryClient.invalidateQueries({ queryKey: HR_CREW_DIRECTORY_KEY });
      queryClient.invalidateQueries({ queryKey: [...HR_PROFILE_AUDIT_KEY, row.id] });
    },
  });
}

interface WriteProfileAuditInput {
  profileId: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  changedColumns: string[];
  oldValues: Record<string, Json | undefined>;
  newValues: Record<string, Json | undefined>;
}

/** Best-effort: audit failures are logged, never thrown, so the save is not rolled back. */
async function writeProfileAudit(input: WriteProfileAuditInput): Promise<void> {
  if (!input.actorUserId) return;
  const changedFields: Record<string, boolean> = {};
  const oldValues: Record<string, Json> = {};
  const newValues: Record<string, Json> = {};
  for (const column of input.changedColumns) {
    changedFields[column] = true;
    oldValues[column] = input.oldValues[column] ?? null;
    newValues[column] = input.newValues[column] ?? null;
  }
  const { error } = await supabase.from('audit_logs').insert({
    entity_type: 'crew_profile',
    entity_id: input.profileId,
    action: 'UPDATE',
    actor_user_id: input.actorUserId,
    actor_email: input.actorEmail,
    actor_role: input.actorRole,
    changed_fields: changedFields,
    old_values: oldValues,
    new_values: newValues,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  });
  if (error) console.error('[hris] audit insert failed:', error.message);
}

export interface UploadAvatarInput {
  profileId: string;
  file: File;
}

/**
 * Upload to the public `avatars` bucket at
 * `<company_id>/<profile_id>/<timestamp>.<ext>` and store the public URL on
 * `profiles.avatar_url`.
 */
export function useUploadAvatar() {
  const queryClient = useQueryClient();
  const { profile: me } = useAuth();

  return useMutation({
    mutationFn: async ({ profileId, file }: UploadAvatarInput): Promise<string> => {
      const problem = validateAvatarFile(file);
      if (problem) throw new Error(problem);
      const companyId = me?.company_id;
      if (!companyId) throw new Error('Your account is not linked to a company');

      const path = avatarStoragePath(companyId, profileId, file.type);
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      const { data, error } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', profileId)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Photo uploaded but the profile could not be updated. You may not have permission.');
      }
      return publicUrl;
    },
    onSuccess: (publicUrl, { profileId }) => {
      queryClient.setQueryData<HrProfile | null>([...HR_PROFILE_KEY, profileId], (prev) =>
        prev ? { ...prev, avatar_url: publicUrl } : prev,
      );
      queryClient.invalidateQueries({ queryKey: [...HR_PROFILE_KEY, profileId] });
      queryClient.invalidateQueries({ queryKey: ['crew'] });
      queryClient.invalidateQueries({ queryKey: HR_CREW_DIRECTORY_KEY });
    },
  });
}

export interface ProfileAuditEntry {
  id: string;
  action: string;
  entity_type: string;
  actor_email: string | null;
  actor_role: string | null;
  changed_fields: Json | null;
  timestamp: string | null;
}

/**
 * Last N audit entries for a profile. Matches both the HRIS key
 * (profiles.id) and the legacy crew module key (user_id). audit_logs RLS
 * only exposes rows to HR-level roles; everyone else simply sees none.
 */
export function useProfileAuditTrail(profileId: string | null | undefined, userId: string | null | undefined, limit = 10) {
  return useQuery({
    queryKey: [...HR_PROFILE_AUDIT_KEY, profileId ?? null, userId ?? null, limit],
    enabled: Boolean(profileId),
    staleTime: 30_000,
    queryFn: async (): Promise<ProfileAuditEntry[]> => {
      const ids = [profileId as string, ...(userId ? [userId] : [])];
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, action, entity_type, actor_email, actor_role, changed_fields, timestamp')
        .in('entity_type', [...PROFILE_AUDIT_ENTITY_TYPES])
        .in('entity_id', ids)
        .order('timestamp', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}
