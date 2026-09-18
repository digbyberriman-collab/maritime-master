import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { intakeToInsert, type IntakeValues, type LegalRequestRow } from '@/modules/legal/lib/requests';
import { errorMessage } from '@/modules/legal/lib/storage';

export const LEGAL_REQUESTS_KEY = ['legal-requests'] as const;
export const LEGAL_REQUEST_KEY = ['legal-request'] as const;
export const LEGAL_REQUEST_EVENTS_KEY = ['legal-request-events'] as const;

/**
 * Legal requests visible to the current user: their own, or every request
 * in the company for the legal team (row level security decides).
 */
export function useLegalRequests(options: { enabled?: boolean } = {}) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...LEGAL_REQUESTS_KEY, companyId],
    enabled: Boolean(user) && Boolean(companyId) && options.enabled !== false,
    queryFn: async (): Promise<LegalRequestRow[]> => {
      const { data, error } = await supabase
        .from('legal_requests')
        .select('*')
        .eq('company_id', companyId as string)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = useCallback(
    (id?: string) => {
      void queryClient.invalidateQueries({ queryKey: LEGAL_REQUESTS_KEY });
      if (id) {
        void queryClient.invalidateQueries({ queryKey: [...LEGAL_REQUEST_KEY, id] });
        void queryClient.invalidateQueries({ queryKey: [...LEGAL_REQUEST_EVENTS_KEY, id] });
      }
    },
    [queryClient],
  );

  const createRequest = useMutation({
    mutationFn: async (values: IntakeValues): Promise<LegalRequestRow> => {
      if (!user?.id) throw new Error('You must be signed in to raise a request');
      if (!companyId) throw new Error('Your profile is not linked to a company');
      const { data, error } = await supabase.from('legal_requests').insert(intakeToInsert(values, user.id, companyId)).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      invalidate(data.id);
      toast.success(`Request ${data.reference_number ?? ''} submitted`, { description: 'The legal team has been notified.' });
    },
    onError: (error) => toast.error('Could not submit the request', { description: errorMessage(error) }),
  });

  const updateRequest = useMutation({
    mutationFn: async ({ id, patch, silent }: { id: string; patch: TablesUpdate<'legal_requests'>; silent?: boolean }): Promise<LegalRequestRow> => {
      const { data, error } = await supabase.from('legal_requests').update(patch).eq('id', id).select('*').single();
      if (error) throw error;
      return Object.assign(data, { __silent: silent }) as LegalRequestRow;
    },
    onSuccess: (data) => {
      invalidate(data.id);
      if (!(data as LegalRequestRow & { __silent?: boolean }).__silent) toast.success('Request updated');
    },
    onError: (error) => toast.error('Could not update the request', { description: errorMessage(error) }),
  });

  const deleteRequest = useMutation({
    mutationFn: async (id: string): Promise<string> => {
      const { error } = await supabase.from('legal_requests').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      invalidate(id);
      toast.success('Request deleted');
    },
    onError: (error) => toast.error('Could not delete the request', { description: errorMessage(error) }),
  });

  const requests = useMemo(() => query.data ?? [], [query.data]);
  return { ...query, requests, createRequest, updateRequest, deleteRequest, invalidate };
}

/** One request by id, with the same visibility rules. */
export function useLegalRequest(id: string | null | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...LEGAL_REQUEST_KEY, id ?? null],
    enabled: Boolean(user) && Boolean(id),
    queryFn: async (): Promise<LegalRequestRow> => {
      const { data, error } = await supabase.from('legal_requests').select('*').eq('id', id as string).single();
      if (error) throw error;
      return data;
    },
  });
}
