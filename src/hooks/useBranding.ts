import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export interface CompanyBranding {
  client_display_name: string | null;
  brand_color: string | null;
  client_logo_url: string | null;
}

export interface BrandingUpdate {
  client_display_name?: string | null;
  brand_color?: string | null;
  client_logo_url?: string | null;
}

const DEFAULT_PRIMARY_COLOR = '#1e3a8a';

export const useBranding = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const brandingQuery = useQuery({
    queryKey: ['company-branding', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return null;
      
      const { data, error } = await supabase
        .from('companies')
        .select('client_display_name, brand_color, client_logo_url, name')
        .eq('id', profile.company_id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.company_id,
  });

  const updateBranding = useMutation({
    mutationFn: async (branding: BrandingUpdate) => {
      if (!profile?.company_id) throw new Error('No company found');
      
      const { data, error } = await supabase
        .from('companies')
        .update(branding)
        .eq('id', profile.company_id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-branding'] });
      toast({
        title: 'Success',
        description: 'Branding settings updated successfully',
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

  const uploadLogo = async (file: File): Promise<string | null> => {
    if (!profile?.company_id) return null;
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${profile.company_id}/logo-${Date.now()}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from('client-logos')
      .upload(fileName, file, { upsert: true });
    
    if (uploadError) {
      toast({
        title: 'Upload failed',
        description: uploadError.message,
        variant: 'destructive',
      });
      return null;
    }
    
    const { data: urlData } = supabase.storage
      .from('client-logos')
      .getPublicUrl(fileName);
    
    return urlData.publicUrl;
  };

  const deleteLogo = async () => {
    if (!profile?.company_id || !brandingQuery.data?.client_logo_url) return;
    
    // Extract path from URL
    const url = brandingQuery.data.client_logo_url;
    const pathMatch = url.match(/client-logos\/(.+)$/);
    if (pathMatch) {
      await supabase.storage.from('client-logos').remove([pathMatch[1]]);
    }
    
    await updateBranding.mutateAsync({ client_logo_url: null });
  };

  // Get effective brand color (custom or default)
  const effectiveBrandColor = brandingQuery.data?.brand_color || DEFAULT_PRIMARY_COLOR;

  return {
    branding: brandingQuery.data,
    isLoading: brandingQuery.isLoading,
    error: brandingQuery.error,
    effectiveBrandColor,
    updateBranding,
    uploadLogo,
    deleteLogo,
  };
};

export const canManageBranding = (role: string | undefined): boolean => {
  return role === 'dpa' || role === 'shore_management';
};
