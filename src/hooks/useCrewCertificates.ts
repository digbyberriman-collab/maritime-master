import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface CrewCertificate {
  id: string;
  user_id: string;
  certificate_type: string;
  certificate_name: string;
  issuing_authority: string | null;
  certificate_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  status: string;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface CrewCertificateFormData {
  certificate_type: string;
  certificate_name: string;
  issuing_authority?: string;
  certificate_number?: string;
  issue_date?: string;
  expiry_date?: string;
  file_url?: string;
  file_name?: string;
  file_size?: number;
  notes?: string;
}

// Maritime certificate type definitions
export const MARITIME_CERTIFICATE_TYPES = [
  { 
    category: 'STCW', 
    types: [
      'STCW Basic Safety Training (VI/1)',
      'STCW Proficiency in Survival Craft (VI/2)',
      'STCW Advanced Firefighting (VI/3)',
      'STCW Medical First Aid (VI/4)',
      'STCW Medical Care (VI/4)',
      'STCW Security Awareness (VI/6)',
      'STCW Crowd Management',
      'STCW Crisis Management',
      'STCW Ship Security Officer'
    ]
  },
  { 
    category: 'Certificates of Competency', 
    types: [
      'Master Unlimited',
      'Master 3000 GT',
      'Master 500 GT',
      'Chief Mate Unlimited',
      'OOW Unlimited',
      'Chief Engineer Unlimited',
      'Second Engineer Unlimited',
      'OICEW',
      'Electro-Technical Officer',
      'Yacht Master Offshore',
      'Yacht Master Ocean'
    ]
  },
  { 
    category: 'Medical', 
    types: [
      'ENG1 Medical Certificate',
      'ML5 Medical Certificate',
      'PADI Diving Medical',
      'Drug & Alcohol Test'
    ]
  },
  { 
    category: 'Safety & Specialized', 
    types: [
      'HUET (Helicopter Underwater Escape Training)',
      'BOSIET',
      'Fast Rescue Boat',
      'Tender Operator',
      'PWC License',
      'Diving Certification',
      'Lifeguard Certification'
    ]
  },
  { 
    category: 'Flag State', 
    types: [
      'Flag State Endorsement',
      'GMDSS Radio Operator',
      'Long Range Certificate',
      'Short Range Certificate'
    ]
  },
  { 
    category: 'Other', 
    types: [
      'Passport',
      'Seamans Book',
      'Visa',
      'Food Safety Certificate',
      'Wine Certification',
      'Other'
    ]
  }
];

export const calculateCertificateStatus = (expiryDate: string | null): string => {
  if (!expiryDate) return 'No Expiry';
  
  const expiry = new Date(expiryDate);
  const today = new Date();
  const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilExpiry < 0) return 'Expired';
  if (daysUntilExpiry <= 30) return 'Expiring Soon';
  if (daysUntilExpiry <= 90) return 'Expiring';
  return 'Valid';
};

export const useCrewCertificates = (userId: string) => {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch certificates for a crew member
  const { data: certificates, isLoading, error } = useQuery({
    queryKey: ['crew-certificates', userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('crew_certificates')
        .select('*')
        .eq('user_id', userId)
        .order('expiry_date', { ascending: true, nullsFirst: false });

      if (error) throw error;

      // Add computed status
      return (data || []).map(cert => ({
        ...cert,
        status: calculateCertificateStatus(cert.expiry_date),
      })) as CrewCertificate[];
    },
    enabled: !!userId,
  });

  // Add certificate mutation
  const addCertificate = useMutation({
    mutationFn: async (formData: CrewCertificateFormData) => {
      if (!profile?.user_id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('crew_certificates')
        .insert({
          user_id: userId,
          ...formData,
          status: calculateCertificateStatus(formData.expiry_date || null),
          created_by: profile.user_id,
        })
        .select()
        .single();

      if (error) throw error;

      // Audit log
      await supabase.from('audit_logs').insert({
        entity_type: 'crew_certificate',
        entity_id: data.id,
        action: 'CREATE',
        actor_user_id: profile.user_id,
        actor_email: user?.email,
        actor_role: profile.role,
        new_values: {
          certificate_name: formData.certificate_name,
          certificate_type: formData.certificate_type,
          expiry_date: formData.expiry_date,
        },
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crew-certificates', userId] });
      toast({
        title: 'Certificate added',
        description: 'Certificate has been successfully added.',
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
    mutationFn: async ({ id, data: formData, oldData }: { 
      id: string; 
      data: Partial<CrewCertificateFormData>;
      oldData?: CrewCertificate;
    }) => {
      if (!profile?.user_id) throw new Error('Not authenticated');

      const updateData = {
        ...formData,
        status: formData.expiry_date 
          ? calculateCertificateStatus(formData.expiry_date) 
          : undefined,
        updated_at: new Date().toISOString(),
        updated_by: profile.user_id,
      };

      const { data, error } = await supabase
        .from('crew_certificates')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Audit log
      await supabase.from('audit_logs').insert({
        entity_type: 'crew_certificate',
        entity_id: id,
        action: 'UPDATE',
        actor_user_id: profile.user_id,
        actor_email: user?.email,
        actor_role: profile.role,
        old_values: oldData ? {
          certificate_name: oldData.certificate_name,
          certificate_type: oldData.certificate_type,
          expiry_date: oldData.expiry_date,
        } : null,
        new_values: {
          certificate_name: formData.certificate_name,
          certificate_type: formData.certificate_type,
          expiry_date: formData.expiry_date,
        },
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crew-certificates', userId] });
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

  // Delete certificate mutation
  const deleteCertificate = useMutation({
    mutationFn: async ({ id, certificate }: { id: string; certificate: CrewCertificate }) => {
      if (!profile?.user_id) throw new Error('Not authenticated');

      // Delete file from storage if exists
      if (certificate.file_url) {
        const filePath = `certificates/${userId}/${certificate.file_url.split('/').pop()}`;
        await supabase.storage.from('documents').remove([filePath]);
      }

      const { error } = await supabase
        .from('crew_certificates')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Audit log
      await supabase.from('audit_logs').insert({
        entity_type: 'crew_certificate',
        entity_id: id,
        action: 'DELETE',
        actor_user_id: profile.user_id,
        actor_email: user?.email,
        actor_role: profile.role,
        old_values: {
          certificate_name: certificate.certificate_name,
          certificate_type: certificate.certificate_type,
          expiry_date: certificate.expiry_date,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crew-certificates', userId] });
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

  // Calculate summary stats
  const stats = {
    total: certificates?.length || 0,
    valid: certificates?.filter(c => c.status === 'Valid' || c.status === 'No Expiry').length || 0,
    expiring: certificates?.filter(c => c.status === 'Expiring' || c.status === 'Expiring Soon').length || 0,
    expired: certificates?.filter(c => c.status === 'Expired').length || 0,
  };

  return {
    certificates,
    stats,
    isLoading,
    error,
    addCertificate,
    updateCertificate,
    deleteCertificate,
  };
};

// Upload certificate file
export const uploadCertificateFile = async (
  file: File, 
  userId: string
): Promise<{ url: string; name: string; size: number }> => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}.${fileExt}`;
  const filePath = `certificates/${userId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(filePath, file);

  if (uploadError) throw uploadError;

  const { data } = supabase.storage
    .from('documents')
    .getPublicUrl(filePath);

  return {
    url: data.publicUrl,
    name: file.name,
    size: file.size,
  };
};
