import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export interface CrewMember {
  id: string;
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  rank: string | null;
  nationality: string | null;
  phone: string | null;
  status: string | null;
  role: string;
  created_at: string;
  current_assignment?: {
    id: string;
    vessel_id: string;
    vessel_name: string;
    position: string;
    join_date: string;
  } | null;
}

export interface CrewAssignment {
  id: string;
  vessel_id: string;
  user_id: string;
  position: string;
  join_date: string;
  leave_date: string | null;
  is_current: boolean;
  vessel?: {
    id: string;
    name: string;
  };
  profile?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

export interface AddCrewMemberData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  nationality?: string;
  rank?: string;
  role: 'master' | 'chief_engineer' | 'chief_officer' | 'crew' | 'dpa' | 'shore_management';
  vesselId?: string;
  position?: string;
  joinDate?: string;
}

export interface UpdateCrewMemberData {
  userId: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  nationality?: string;
  rank?: string;
  status?: string;
}

export interface TransferCrewData {
  userId: string;
  currentAssignmentId: string;
  newVesselId: string;
  position: string;
  transferDate: string;
  notes?: string;
}

// Fetch all crew members for the company
export const useCrew = (vesselFilter?: string) => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const crewQuery = useQuery({
    queryKey: ['crew', profile?.company_id, vesselFilter],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      // Get all profiles in the company
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .eq('company_id', profile.company_id)
        .neq('status', 'Inactive');

      if (profilesError) throw profilesError;
      if (!profiles || profiles.length === 0) return [];

      // Get current assignments
      const { data: assignments, error: assignmentsError } = await supabase
        .from('crew_assignments')
        .select(`
          id,
          vessel_id,
          user_id,
          position,
          join_date,
          vessels (id, name)
        `)
        .eq('is_current', true);

      if (assignmentsError) throw assignmentsError;

      // Map profiles with their current assignments
      const crewMembers: CrewMember[] = profiles.map((p) => {
        const assignment = assignments?.find((a) => a.user_id === p.user_id);
        return {
          id: p.id,
          user_id: p.user_id,
          email: p.email,
          first_name: p.first_name,
          last_name: p.last_name,
          rank: p.rank,
          nationality: p.nationality,
          phone: p.phone,
          status: p.status,
          role: p.role,
          created_at: p.created_at,
          current_assignment: assignment
            ? {
                id: assignment.id,
                vessel_id: assignment.vessel_id,
                vessel_name: (assignment.vessels as any)?.name || 'Unknown',
                position: assignment.position,
                join_date: assignment.join_date,
              }
            : null,
        };
      });

      // Filter by vessel if specified
      if (vesselFilter && vesselFilter !== 'all') {
        return crewMembers.filter(
          (c) => c.current_assignment?.vessel_id === vesselFilter
        );
      }

      return crewMembers;
    },
    enabled: !!profile?.company_id,
  });

  const addCrewMember = useMutation({
    mutationFn: async (data: AddCrewMemberData) => {
      // Create auth user via edge function (needed for admin creation)
      const { data: result, error: fnError } = await supabase.functions.invoke(
        'create-crew-member',
        {
          body: {
            email: data.email,
            password: data.password,
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
            nationality: data.nationality,
            rank: data.rank,
            role: data.role,
            companyId: profile?.company_id,
            vesselId: data.vesselId,
            position: data.position,
            joinDate: data.joinDate,
          },
        }
      );

      if (fnError) throw fnError;
      if (result?.error) throw new Error(result.error);

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crew'] });
      queryClient.invalidateQueries({ queryKey: ['crew-count'] });
      toast({
        title: 'Success',
        description: 'Crew member added successfully',
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

  const updateCrewMember = useMutation({
    mutationFn: async (data: UpdateCrewMemberData) => {
      const updateData: Record<string, any> = {};
      if (data.firstName) updateData.first_name = data.firstName;
      if (data.lastName) updateData.last_name = data.lastName;
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.nationality !== undefined) updateData.nationality = data.nationality;
      if (data.rank !== undefined) updateData.rank = data.rank;
      if (data.status !== undefined) updateData.status = data.status;

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('user_id', data.userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crew'] });
      toast({
        title: 'Success',
        description: 'Crew member updated successfully',
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

  const transferCrew = useMutation({
    mutationFn: async (data: TransferCrewData) => {
      // End current assignment
      const { error: endError } = await supabase
        .from('crew_assignments')
        .update({
          is_current: false,
          leave_date: data.transferDate,
        })
        .eq('id', data.currentAssignmentId);

      if (endError) throw endError;

      // Create new assignment
      const { error: createError } = await supabase
        .from('crew_assignments')
        .insert({
          user_id: data.userId,
          vessel_id: data.newVesselId,
          position: data.position,
          join_date: data.transferDate,
          is_current: true,
        });

      if (createError) throw createError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crew'] });
      queryClient.invalidateQueries({ queryKey: ['crew-changes'] });
      toast({
        title: 'Success',
        description: 'Crew member transferred successfully',
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

  const signOffCrew = useMutation({
    mutationFn: async ({
      assignmentId,
      leaveDate,
    }: {
      assignmentId: string;
      leaveDate: string;
    }) => {
      const { error } = await supabase
        .from('crew_assignments')
        .update({
          is_current: false,
          leave_date: leaveDate,
        })
        .eq('id', assignmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crew'] });
      queryClient.invalidateQueries({ queryKey: ['crew-changes'] });
      toast({
        title: 'Success',
        description: 'Crew member signed off successfully',
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

  const deactivateCrew = useMutation({
    mutationFn: async (userId: string) => {
      // Mark profile as inactive
      const { error } = await supabase
        .from('profiles')
        .update({ status: 'Inactive' })
        .eq('user_id', userId);

      if (error) throw error;

      // End any current assignments
      await supabase
        .from('crew_assignments')
        .update({
          is_current: false,
          leave_date: new Date().toISOString().split('T')[0],
        })
        .eq('user_id', userId)
        .eq('is_current', true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crew'] });
      queryClient.invalidateQueries({ queryKey: ['crew-count'] });
      toast({
        title: 'Success',
        description: 'Crew member deactivated',
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
    crew: crewQuery.data ?? [],
    isLoading: crewQuery.isLoading,
    error: crewQuery.error,
    addCrewMember,
    updateCrewMember,
    transferCrew,
    signOffCrew,
    deactivateCrew,
  };
};

// Get crew count for dashboard
export const useCrewCount = () => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['crew-count', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return 0;

      const { count, error } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', profile.company_id)
        .eq('status', 'Active');

      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!profile?.company_id,
  });
};

// Get recent crew changes for dashboard
export const useRecentCrewChanges = (limit = 5) => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['crew-changes', profile?.company_id, limit],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      // Get recent assignments/changes
      const { data, error } = await supabase
        .from('crew_assignments')
        .select(`
          id,
          position,
          join_date,
          leave_date,
          is_current,
          created_at,
          vessels (id, name),
          profiles!crew_assignments_user_id_fkey (first_name, last_name)
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return (data || []).map((change) => ({
        id: change.id,
        crewName: `${(change.profiles as any)?.first_name || ''} ${(change.profiles as any)?.last_name || ''}`.trim(),
        vesselName: (change.vessels as any)?.name || 'Unknown',
        position: change.position,
        joinDate: change.join_date,
        leaveDate: change.leave_date,
        isCurrent: change.is_current,
        createdAt: change.created_at,
        type: change.leave_date ? 'sign_off' : 'join',
      }));
    },
    enabled: !!profile?.company_id,
  });
};

// Get single crew member details
export const useCrewMember = (userId: string) => {
  return useQuery({
    queryKey: ['crew-member', userId],
    queryFn: async () => {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile) throw new Error('Crew member not found');

      // Get all assignments for this crew member
      const { data: assignments, error: assignmentsError } = await supabase
        .from('crew_assignments')
        .select(`
          id,
          vessel_id,
          position,
          join_date,
          leave_date,
          is_current,
          vessels (id, name)
        `)
        .eq('user_id', userId)
        .order('join_date', { ascending: false });

      if (assignmentsError) throw assignmentsError;

      return {
        ...profile,
        assignments: (assignments || []).map((a) => ({
          id: a.id,
          vesselId: a.vessel_id,
          vesselName: (a.vessels as any)?.name || 'Unknown',
          position: a.position,
          joinDate: a.join_date,
          leaveDate: a.leave_date,
          isCurrent: a.is_current,
        })),
      };
    },
    enabled: !!userId,
  });
};
