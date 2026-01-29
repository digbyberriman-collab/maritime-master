import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { 
  DataRetentionPolicy, 
  HRRecordMetadata, 
  RecordLifecycleStatus,
  HRRecordType 
} from '@/lib/compliance/types';

export const useDataRetention = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id;

  // Fetch retention policies
  const { data: retentionPolicies, isLoading: policiesLoading } = useQuery({
    queryKey: ['retention-policies', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      
      const { data, error } = await supabase
        .from('data_retention_policies')
        .select('*')
        .eq('company_id', companyId);
      
      if (error) throw error;
      return data as DataRetentionPolicy[];
    },
    enabled: !!companyId,
  });

  // Fetch records pending archive
  const { data: pendingArchiveRecords, isLoading: pendingLoading } = useQuery({
    queryKey: ['pending-archive-records', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      
      const { data, error } = await supabase
        .from('hr_record_metadata')
        .select('*')
        .eq('company_id', companyId)
        .in('lifecycle_status', ['active', 'pending_archive'])
        .lte('retention_end_date', new Date().toISOString().split('T')[0]);
      
      if (error) throw error;
      return data as HRRecordMetadata[];
    },
    enabled: !!companyId,
  });

  // Update retention policy
  const updatePolicy = useMutation({
    mutationFn: async (policy: Partial<DataRetentionPolicy> & { id: string }) => {
      const { data, error } = await supabase
        .from('data_retention_policies')
        .update({
          retention_years: policy.retention_years,
          auto_archive: policy.auto_archive,
          require_dpa_approval_for_deletion: policy.require_dpa_approval_for_deletion,
          updated_at: new Date().toISOString(),
        })
        .eq('id', policy.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retention-policies', companyId] });
      toast({
        title: 'Policy Updated',
        description: 'Retention policy has been updated successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Archive a record
  const archiveRecord = useMutation({
    mutationFn: async ({ recordId, userId }: { recordId: string; userId: string }) => {
      const { data, error } = await supabase
        .from('hr_record_metadata')
        .update({
          lifecycle_status: 'archived' as RecordLifecycleStatus,
          archived_at: new Date().toISOString(),
          archived_by: userId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', recordId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-archive-records', companyId] });
      toast({
        title: 'Record Archived',
        description: 'Record has been moved to archive.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Archive Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Anonymize a record (GDPR erasure)
  const anonymizeRecord = useMutation({
    mutationFn: async ({ recordId, userId }: { recordId: string; userId: string }) => {
      const { data, error } = await supabase
        .from('hr_record_metadata')
        .update({
          lifecycle_status: 'anonymized' as RecordLifecycleStatus,
          anonymized_at: new Date().toISOString(),
          anonymized_by: userId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', recordId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-archive-records', companyId] });
      toast({
        title: 'Record Anonymized',
        description: 'Personal data has been anonymized per GDPR requirements.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Anonymization Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Get retention policy for a specific record type
  const getRetentionPolicy = (recordType: HRRecordType): DataRetentionPolicy | undefined => {
    return retentionPolicies?.find((p) => p.record_type === recordType);
  };

  // Calculate retention end date based on policy
  const calculateRetentionEndDate = (
    recordType: HRRecordType,
    triggerDate: Date
  ): Date | undefined => {
    const policy = getRetentionPolicy(recordType);
    if (!policy) return undefined;
    
    const endDate = new Date(triggerDate);
    endDate.setFullYear(endDate.getFullYear() + policy.retention_years);
    return endDate;
  };

  return {
    retentionPolicies,
    pendingArchiveRecords,
    policiesLoading,
    pendingLoading,
    updatePolicy,
    archiveRecord,
    anonymizeRecord,
    getRetentionPolicy,
    calculateRetentionEndDate,
  };
};
