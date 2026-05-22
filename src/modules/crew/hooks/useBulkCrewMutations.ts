import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/shared/hooks/use-toast';

type RowResult = { userId: string; ok: boolean; error?: string };

const summarise = (verb: string, results: RowResult[]) => {
  const ok = results.filter((r) => r.ok).length;
  const failed = results.length - ok;
  if (failed === 0) {
    toast({ title: verb, description: `Updated ${ok} crew member${ok === 1 ? '' : 's'}.` });
  } else if (ok === 0) {
    toast({
      title: `${verb} failed`,
      description: `All ${failed} updates failed. ${results.find((r) => !r.ok)?.error ?? ''}`,
      variant: 'destructive',
    });
  } else {
    toast({
      title: verb,
      description: `Updated ${ok}, ${failed} failed.`,
      variant: 'destructive',
    });
  }
};

export interface BulkProfilePatch {
  department?: string | null;
  rotation?: string | null;
  account_status?: string | null;
  status?: string | null;
}

const ALLOWED_PROFILE_KEYS: Array<keyof BulkProfilePatch> = [
  'department',
  'rotation',
  'account_status',
  'status',
];

const sanitisePatch = (patch: BulkProfilePatch): BulkProfilePatch => {
  const out: BulkProfilePatch = {};
  for (const key of ALLOWED_PROFILE_KEYS) {
    if (key in patch) out[key] = patch[key];
  }
  return out;
};

export const useBulkUpdateProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userIds, patch }: { userIds: string[]; patch: BulkProfilePatch }) => {
      const safe = sanitisePatch(patch);
      const results: RowResult[] = [];
      for (const userId of userIds) {
        const { error } = await supabase
          .from('profiles')
          .update({ ...safe, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
        results.push({ userId, ok: !error, error: error?.message });
      }
      return results;
    },
    onSettled: (results) => {
      qc.invalidateQueries({ queryKey: ['crew'] });
      summarise('Bulk update', results ?? []);
    },
  });
};

export const useBulkReassignVessel = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userIds,
      vesselId,
      position,
      transferDate,
    }: {
      userIds: string[];
      vesselId: string;
      position?: string;
      transferDate: string;
    }) => {
      const results: RowResult[] = [];
      for (const userId of userIds) {
        try {
          const { data: current } = await supabase
            .from('crew_assignments')
            .select('id, position')
            .eq('user_id', userId)
            .eq('is_current', true)
            .maybeSingle();

          if (current?.id) {
            const { error: endErr } = await supabase
              .from('crew_assignments')
              .update({ is_current: false, leave_date: transferDate })
              .eq('id', current.id);
            if (endErr) throw endErr;
          }

          const { error: createErr } = await supabase.from('crew_assignments').insert({
            user_id: userId,
            vessel_id: vesselId,
            position: position || current?.position || 'Crew',
            join_date: transferDate,
            is_current: true,
          });
          if (createErr) throw createErr;

          results.push({ userId, ok: true });
        } catch (e: unknown) {
          results.push({ userId, ok: false, error: e instanceof Error ? e.message : String(e) });
        }
      }
      return results;
    },
    onSettled: (results) => {
      qc.invalidateQueries({ queryKey: ['crew'] });
      qc.invalidateQueries({ queryKey: ['crew-changes'] });
      summarise('Reassign', results ?? []);
    },
  });
};
