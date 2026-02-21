import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useToast } from '@/shared/hooks/use-toast';
import { calculateCertificateStatus } from '@/modules/certificates/constants';

export interface Certificate {
  id: string;
  certificate_type: string;
  certificate_category: string | null;
  certificate_number: string;
  certificate_name: string;
  issuing_authority: string;
  vessel_id: string | null;
  user_id: string | null;
  company_id: string;
  issue_date: string;
  expiry_date: string;
  next_survey_date: string | null;
  file_url: string | null;
  status: string;
  alert_days: number;
  notes: string | null;
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
  vessels?: { id: string; name: string } | null;
  profiles?: { user_id: string; first_name: string; last_name: string; rank: string | null } | null;
}

export interface CertificateAlert {
  id: string;
  certificate_id: string;
  alert_date: string;
  alert_type: string;
  sent_at: string | null;
  sent_to: string[];
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

export interface CertificateFormData {
  certificate_type: string;
  certificate_category?: string;
  certificate_number: string;
  certificate_name: string;
  issuing_authority: string;
  vessel_id?: string | null;
  user_id?: string | null;
  issue_date: string;
  expiry_date: string;
  next_survey_date?: string | null;
  file_url?: string | null;
  alert_days?: number;
  notes?: string | null;
}

export const useCertificates = (filters?: {
  type?: string;
  vesselId?: string;
  userId?: string;
  status?: string;
}) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch certificates
  const { data: certificates, isLoading, error } = useQuery({
    queryKey: ['certificates', profile?.company_id, filters],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      let query = supabase
        .from('certificates')
        .select(`
          *,
          vessels:vessel_id(id, name),
          profiles:user_id(user_id, first_name, last_name, rank)
        `)
        .eq('company_id', profile.company_id)
        .neq('status', 'Superseded')
        .order('expiry_date', { ascending: true });

      if (filters?.type) {
        query = query.eq('certificate_type', filters.type);
      }
      if (filters?.vesselId) {
        query = query.eq('vessel_id', filters.vesselId);
      }
      if (filters?.userId) {
        query = query.eq('user_id', filters.userId);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Certificate[];
    },
    enabled: !!profile?.company_id,
  });

  // Fetch certificate alerts
  const { data: alerts } = useQuery({
    queryKey: ['certificate-alerts', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      const { data, error } = await supabase
        .from('certificate_alerts')
        .select(`
          *,
          certificates:certificate_id(
            id,
            certificate_name,
            certificate_number,
            expiry_date,
            status,
            vessel_id,
            user_id,
            company_id
          )
        `)
        .is('acknowledged_at', null)
        .order('alert_date', { ascending: true });

      if (error) throw error;
      
      // Filter by company_id via the certificate relationship
      return (data || []).filter((alert: any) => 
        alert.certificates?.company_id === profile.company_id
      );
    },
    enabled: !!profile?.company_id,
  });

  // Add certificate mutation
  const addCertificate = useMutation({
    mutationFn: async (formData: CertificateFormData) => {
      if (!profile?.company_id) throw new Error('No company ID');

      const status = calculateCertificateStatus(formData.expiry_date, formData.alert_days || 90);

      const { data, error } = await supabase
        .from('certificates')
        .insert({
          ...formData,
          company_id: profile.company_id,
          status,
        })
        .select()
        .single();

      if (error) throw error;

      // Create alert schedule
      const alertDays = formData.alert_days || 90;
      const alertThresholds = [90, 60, 30, 7, 0].filter(d => d <= alertDays);
      const expiryDate = new Date(formData.expiry_date);
      
      const alertsToCreate = alertThresholds.map(days => {
        const alertDate = new Date(expiryDate);
        alertDate.setDate(alertDate.getDate() - days);
        return {
          certificate_id: data.id,
          alert_date: alertDate.toISOString().split('T')[0],
          alert_type: days === 0 ? 'Expired' : `${days}_day`,
        };
      });

      if (alertsToCreate.length > 0) {
        await supabase.from('certificate_alerts').insert(alertsToCreate);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['certificates'] });
      queryClient.invalidateQueries({ queryKey: ['certificate-alerts'] });
      toast({
        title: 'Certificate added',
        description: 'Certificate has been successfully created.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to add certificate. Please try again.',
        variant: 'destructive',
      });
      console.error('Error adding certificate:', error);
    },
  });

  // Update certificate mutation
  const updateCertificate = useMutation({
    mutationFn: async ({ id, data: formData }: { id: string; data: Partial<CertificateFormData> }) => {
      const updateData: any = { ...formData };
      
      if (formData.expiry_date) {
        updateData.status = calculateCertificateStatus(formData.expiry_date, formData.alert_days || 90);
      }

      const { data, error } = await supabase
        .from('certificates')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['certificates'] });
      toast({
        title: 'Certificate updated',
        description: 'Certificate has been successfully updated.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to update certificate. Please try again.',
        variant: 'destructive',
      });
      console.error('Error updating certificate:', error);
    },
  });

  // Renew certificate mutation
  const renewCertificate = useMutation({
    mutationFn: async ({ oldId, formData }: { oldId: string; formData: CertificateFormData }) => {
      if (!profile?.company_id) throw new Error('No company ID');

      // Mark old certificate as superseded
      await supabase
        .from('certificates')
        .update({ status: 'Superseded' })
        .eq('id', oldId);

      // Create new certificate
      const status = calculateCertificateStatus(formData.expiry_date, formData.alert_days || 90);

      const { data: newCert, error } = await supabase
        .from('certificates')
        .insert({
          ...formData,
          company_id: profile.company_id,
          status,
        })
        .select()
        .single();

      if (error) throw error;

      // Link old to new
      await supabase
        .from('certificates')
        .update({ superseded_by: newCert.id })
        .eq('id', oldId);

      // Create new alert schedule
      const alertDays = formData.alert_days || 90;
      const alertThresholds = [90, 60, 30, 7, 0].filter(d => d <= alertDays);
      const expiryDate = new Date(formData.expiry_date);
      
      const alertsToCreate = alertThresholds.map(days => {
        const alertDate = new Date(expiryDate);
        alertDate.setDate(alertDate.getDate() - days);
        return {
          certificate_id: newCert.id,
          alert_date: alertDate.toISOString().split('T')[0],
          alert_type: days === 0 ? 'Expired' : `${days}_day`,
        };
      });

      if (alertsToCreate.length > 0) {
        await supabase.from('certificate_alerts').insert(alertsToCreate);
      }

      return newCert;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['certificates'] });
      queryClient.invalidateQueries({ queryKey: ['certificate-alerts'] });
      toast({
        title: 'Certificate renewed',
        description: 'Certificate has been successfully renewed.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to renew certificate. Please try again.',
        variant: 'destructive',
      });
      console.error('Error renewing certificate:', error);
    },
  });

  // Delete certificate mutation
  const deleteCertificate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('certificates')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['certificates'] });
      queryClient.invalidateQueries({ queryKey: ['certificate-alerts'] });
      toast({
        title: 'Certificate deleted',
        description: 'Certificate has been successfully deleted.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to delete certificate. Please try again.',
        variant: 'destructive',
      });
      console.error('Error deleting certificate:', error);
    },
  });

  // Acknowledge alert mutation
  const acknowledgeAlert = useMutation({
    mutationFn: async (alertId: string) => {
      if (!profile?.user_id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('certificate_alerts')
        .update({
          acknowledged_by: profile.user_id,
          acknowledged_at: new Date().toISOString(),
        })
        .eq('id', alertId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['certificate-alerts'] });
      toast({
        title: 'Alert acknowledged',
        description: 'Alert has been acknowledged.',
      });
    },
  });

  // Calculate summary stats
  const stats = {
    total: certificates?.length || 0,
    expiringSoon: certificates?.filter(c => c.status === 'Expiring_Soon').length || 0,
    expired: certificates?.filter(c => c.status === 'Expired').length || 0,
    nextExpiry: certificates?.[0] || null, // Already sorted by expiry_date ascending
  };

  return {
    certificates,
    alerts,
    stats,
    isLoading,
    error,
    addCertificate,
    updateCertificate,
    renewCertificate,
    deleteCertificate,
    acknowledgeAlert,
  };
};

// Upload certificate file
export const uploadCertificateFile = async (file: File, companyId: string): Promise<string> => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${companyId}/${Date.now()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(fileName, file);

  if (uploadError) throw uploadError;

  const { data } = supabase.storage
    .from('documents')
    .getPublicUrl(fileName);

  return data.publicUrl;
};
