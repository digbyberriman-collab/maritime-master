// Users API Hooks (7.1)
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import type { 
  UserProfile, 
  UpdateUserRequest, 
  BulkInviteRequest, 
  BulkInviteResponse 
} from '../types';

// Query keys
export const usersKeys = {
  all: ['users'] as const,
  list: (companyId: string) => [...usersKeys.all, 'list', companyId] as const,
  detail: (id: string) => [...usersKeys.all, 'detail', id] as const,
};

// Map DB row to API type
const mapUserFromDb = (row: any): UserProfile => ({
  id: row.id,
  userId: row.user_id,
  email: row.email,
  firstName: row.first_name,
  lastName: row.last_name,
  preferredName: row.preferred_name,
  phone: row.phone,
  emergencyContactName: row.emergency_contact_name,
  emergencyContactPhone: row.emergency_contact_phone,
  nationality: row.nationality,
  dateOfBirth: row.date_of_birth,
  gender: row.gender,
  rank: row.rank,
  position: row.position,
  department: row.department,
  passportNumber: row.passport_number,
  passportExpiry: row.passport_expiry,
  medicalExpiry: row.medical_expiry,
  visaStatus: row.visa_status,
  status: row.status,
  avatarUrl: row.avatar_url,
  companyId: row.company_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// GET /api/users - List users
export const useUsers = () => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: usersKeys.list(profile?.company_id || ''),
    queryFn: async (): Promise<UserProfile[]> => {
      if (!profile?.company_id) return [];
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('company_id', profile.company_id)
        .neq('status', 'Inactive')
        .order('last_name');
      
      if (error) throw error;
      return (data || []).map(mapUserFromDb);
    },
    enabled: !!profile?.company_id,
  });
};

// GET /api/users/{id} - Get user profile
export const useUser = (userId: string) => {
  return useQuery({
    queryKey: usersKeys.detail(userId),
    queryFn: async (): Promise<UserProfile> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (error) throw error;
      return mapUserFromDb(data);
    },
    enabled: !!userId,
  });
};

// PATCH /api/users/{id} - Update user
export const useUpdateUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: UpdateUserRequest }) => {
      const { data: result, error } = await supabase
        .from('profiles')
        .update({
          first_name: data.firstName,
          last_name: data.lastName,
          preferred_name: data.preferredName,
          phone: data.phone,
          emergency_contact_name: data.emergencyContactName,
          emergency_contact_phone: data.emergencyContactPhone,
          nationality: data.nationality,
          date_of_birth: data.dateOfBirth,
          gender: data.gender,
          rank: data.rank,
          position: data.position,
          department: data.department,
          passport_number: data.passportNumber,
          passport_expiry: data.passportExpiry,
          medical_expiry: data.medicalExpiry,
          visa_status: data.visaStatus,
          avatar_url: data.avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: usersKeys.detail(userId) });
      queryClient.invalidateQueries({ queryKey: usersKeys.all });
      toast({ title: 'Success', description: 'User updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
};

// POST /api/users/{id}/send-invitation - Send invitation
export const useSendInvitation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // Get current count
      const { data: current } = await supabase
        .from('profiles')
        .select('invitation_count')
        .eq('user_id', userId)
        .single();

      const { error } = await supabase
        .from('profiles')
        .update({
          invitation_token: token,
          invitation_token_expires: expiresAt.toISOString(),
          last_invited_at: new Date().toISOString(),
          invitation_count: (current?.invitation_count || 0) + 1,
        })
        .eq('user_id', userId);
      
      if (error) throw error;
      return { token };
    },
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: usersKeys.detail(userId) });
      toast({ title: 'Success', description: 'Invitation sent successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
};

// POST /api/users/bulk-invite - Bulk send invitations
export const useBulkInvite = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: BulkInviteRequest): Promise<BulkInviteResponse> => {
      const sent: string[] = [];
      const failed: { userId: string; reason: string }[] = [];

      for (const userId of request.userIds) {
        try {
          const token = crypto.randomUUID();
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 7);

          const { error } = await supabase
            .from('profiles')
            .update({
              invitation_token: token,
              invitation_token_expires: expiresAt.toISOString(),
              last_invited_at: new Date().toISOString(),
            })
            .eq('user_id', userId);

          if (error) {
            failed.push({ userId, reason: error.message });
          } else {
            sent.push(userId);
          }
        } catch (err) {
          failed.push({ userId, reason: (err as Error).message });
        }
      }

      return { sent, failed };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: usersKeys.all });
      toast({ 
        title: 'Bulk Invite Complete', 
        description: `Sent: ${result.sent.length}, Failed: ${result.failed.length}` 
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
};
