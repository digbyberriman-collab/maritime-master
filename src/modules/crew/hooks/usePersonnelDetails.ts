import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/shared/hooks/use-toast';

export type PersonnelType = 'crew' | 'contractor' | 'shoreside';

export interface PersonnelDetailsInput {
  profileId: string;
  personnel_type?: PersonnelType;
  job_title?: string | null;
  office_location?: string | null;
  place_of_birth?: string | null;
  passport_country?: string | null;
  passport_number?: string | null;
  passport_expiry?: string | null;
  seamans_book_number?: string | null;
  embarkation_port?: string | null;
}

/**
 * Updates the personnel-record fields that the crew list owns (classification,
 * identity documents and the port details required on an official crew list).
 */
export const usePersonnelDetails = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ profileId, ...fields }: PersonnelDetailsInput) => {
      const payload: Record<string, unknown> = {};
      Object.entries(fields).forEach(([key, value]) => {
        if (value !== undefined) payload[key] = value === '' ? null : value;
      });
      if (Object.keys(payload).length === 0) return;

      const { error } = await supabase
        .from('profiles')
        .update(payload as never)
        .eq('id', profileId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crew'] });
      toast({ title: 'Personnel record updated' });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Could not update record',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    },
  });
};
