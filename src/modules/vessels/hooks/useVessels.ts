import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { toast } from '@/shared/hooks/use-toast';

export interface Vessel {
  id: string;
  company_id: string;
  name: string;
  imo_number: string | null;
  flag_state: string | null;
  vessel_type: string | null;
  classification_society: string | null;
  gross_tonnage: number | null;
  build_year: number | null;
  status: string | null;
  mmsi: string | null;
  call_sign: string | null;
  home_port: string | null;
  length_overall: number | null;
  beam: number | null;
  draft: number | null;
  builder: string | null;
  operational_status: string | null;
  created_at: string;
  updated_at: string;
  particulars?: Record<string, string> | null;
}

export interface VesselFormData {
  name: string;
  imo_number: string | null;
  flag_state: string | null;
  classification_society: string | null;
  vessel_type: string | null;
  gross_tonnage: number | null;
  build_year: number | null;
  status: string;
  mmsi?: string | null;
  call_sign?: string | null;
  home_port?: string | null;
  length_overall?: number | null;
  beam?: number | null;
  draft?: number | null;
  builder?: string | null;
  operational_status?: string | null;
}

const vesselPayload = (formData: VesselFormData) => ({
  name: formData.name,
  imo_number: formData.imo_number || null,
  flag_state: formData.flag_state || null,
  classification_society: formData.classification_society || null,
  vessel_type: formData.vessel_type || null,
  gross_tonnage: formData.gross_tonnage,
  build_year: formData.build_year,
  status: formData.status,
  mmsi: formData.mmsi || null,
  call_sign: formData.call_sign || null,
  home_port: formData.home_port || null,
  length_overall: formData.length_overall ?? null,
  beam: formData.beam ?? null,
  draft: formData.draft ?? null,
  builder: formData.builder || null,
  operational_status: formData.operational_status || null,
});

export const useVessels = () => {
  const { profile } = useAuth();
  const { refreshVessels } = useVessel();
  const queryClient = useQueryClient();

  const vesselsQuery = useQuery({
    queryKey: ['vessels', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      
      const { data, error } = await supabase
        .from('vessels')
        .select('*')
        .eq('company_id', profile.company_id)
        .neq('status', 'Sold')
        .order('name');
      
      if (error) throw error;
      return data as Vessel[];
    },
    enabled: !!profile?.company_id,
  });

  const createVessel = useMutation({
    mutationFn: async (formData: VesselFormData) => {
      if (!profile?.company_id) throw new Error('No company found');
      
      const { data, error } = await supabase
        .from('vessels')
        .insert({
          company_id: profile.company_id,
          ...vesselPayload(formData),
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vessels'] });
      refreshVessels();
      toast({
        title: 'Success',
        description: 'Vessel created successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateVessel = useMutation({
    mutationFn: async ({ id, formData }: { id: string; formData: VesselFormData }) => {
      const { data, error } = await supabase
        .from('vessels')
        .update(vesselPayload(formData))
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vessels'] });
      refreshVessels();
      toast({
        title: 'Success',
        description: 'Vessel updated successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteVessel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('vessels')
        .update({ status: 'Sold' })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vessels'] });
      refreshVessels();
      toast({
        title: 'Success',
        description: 'Vessel removed successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateVesselParticulars = useMutation({
    mutationFn: async ({ id, particulars }: { id: string; particulars: Record<string, string> }) => {
      const { data, error } = await supabase
        .from('vessels')
        .update({ particulars })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vessels'] });
      refreshVessels();
      toast({
        title: 'Saved',
        description: 'Vessel particulars updated',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    vessels: vesselsQuery.data ?? [],
    isLoading: vesselsQuery.isLoading,
    error: vesselsQuery.error,
    createVessel,
    updateVessel,
    deleteVessel,
    updateVesselParticulars,
  };
};

export const useVesselCount = () => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['vessel-count', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return 0;
      
      const { count, error } = await supabase
        .from('vessels')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', profile.company_id)
        .neq('status', 'Sold');
      
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!profile?.company_id,
  });
};
