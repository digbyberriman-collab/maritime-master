import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useToast } from '@/shared/hooks/use-toast';
import { generateDrillNumber } from '@/modules/drills/constants';

export interface DrillType {
  id: string;
  drill_name: string;
  category: string;
  minimum_frequency: number;
  solas_reference: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Drill {
  id: string;
  drill_number: string;
  vessel_id: string;
  drill_type_id: string;
  drill_date_scheduled: string;
  drill_date_actual: string | null;
  drill_duration_minutes: number | null;
  scenario_description: string;
  objectives: string[];
  conducted_by_id: string | null;
  location: string | null;
  weather_conditions: string | null;
  status: string;
  cancelled_reason: string | null;
  lessons_learned_positive: string | null;
  lessons_learned_improvement: string | null;
  recommendations: string | null;
  overall_rating: number | null;
  created_at: string;
  updated_at: string;
  vessel?: { id: string; name: string } | null;
  drill_type?: DrillType | null;
  conducted_by?: { user_id: string; first_name: string; last_name: string } | null;
}

export interface DrillParticipant {
  id: string;
  drill_id: string;
  user_id: string;
  station_assignment: string | null;
  expected_to_attend: boolean;
  attended: boolean | null;
  absent_reason: string | null;
  late_arrival_minutes: number | null;
  performance_rating: number | null;
  comments: string | null;
  created_at: string;
  profile?: { user_id: string; first_name: string; last_name: string; rank: string | null } | null;
}

export interface DrillEvaluation {
  id: string;
  drill_id: string;
  objective_index: number;
  objective_text: string;
  achieved: boolean | null;
  notes: string | null;
  evaluator_id: string | null;
  created_at: string;
}

export interface DrillDeficiency {
  id: string;
  drill_id: string;
  deficiency_description: string;
  severity: string;
  corrective_action_id: string | null;
  photo_urls: string[];
  created_at: string;
}

export interface DrillEquipment {
  id: string;
  drill_id: string;
  equipment_name: string;
  equipment_used: boolean | null;
  equipment_status: string | null;
  notes: string | null;
  created_at: string;
}

export interface EmergencyContact {
  id: string;
  vessel_id: string;
  contact_category: string;
  organization_name: string;
  contact_person: string | null;
  phone_primary: string;
  phone_secondary: string | null;
  email: string | null;
  available_24_7: boolean;
  notes: string | null;
  display_order: number;
  created_at: string;
}

export interface EmergencyProcedure {
  id: string;
  vessel_id: string;
  emergency_type: string;
  procedure_document_id: string | null;
  muster_station: string | null;
  key_actions: string[];
  responsible_officer: string | null;
  created_at: string;
}

export function useDrills() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch drill types
  const { data: drillTypes = [], isLoading: drillTypesLoading } = useQuery({
    queryKey: ['drill-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drill_types')
        .select('*')
        .eq('is_active', true)
        .order('drill_name');

      if (error) throw error;
      return data as DrillType[];
    },
  });

  // Fetch all drills
  const { data: drills = [], isLoading: drillsLoading } = useQuery({
    queryKey: ['drills', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      const { data, error } = await supabase
        .from('drills')
        .select(`
          *,
          vessel:vessels(id, name),
          drill_type:drill_types(*),
          conducted_by:profiles!drills_conducted_by_id_fkey(user_id, first_name, last_name)
        `)
        .order('drill_date_scheduled', { ascending: false });

      if (error) throw error;
      return data as Drill[];
    },
    enabled: !!profile?.company_id,
  });

  // Fetch emergency contacts
  const { data: emergencyContacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ['emergency-contacts', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      const { data, error } = await supabase
        .from('emergency_contacts')
        .select('*')
        .order('display_order');

      if (error) throw error;
      return data as EmergencyContact[];
    },
    enabled: !!profile?.company_id,
  });

  // Fetch emergency procedures
  const { data: emergencyProcedures = [], isLoading: proceduresLoading } = useQuery({
    queryKey: ['emergency-procedures', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      const { data, error } = await supabase
        .from('emergency_procedures')
        .select('*')
        .order('emergency_type');

      if (error) throw error;
      return data as EmergencyProcedure[];
    },
    enabled: !!profile?.company_id,
  });

  // Add drill mutation
  const addDrillMutation = useMutation({
    mutationFn: async (drillData: Omit<Drill, 'id' | 'drill_number' | 'created_at' | 'updated_at' | 'vessel' | 'drill_type' | 'conducted_by'>) => {
      const drillNumber = generateDrillNumber(drills.length);

      const { data, error } = await supabase
        .from('drills')
        .insert([{ ...drillData, drill_number: drillNumber }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drills'] });
      toast({ title: 'Drill scheduled successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to schedule drill', description: error.message, variant: 'destructive' });
    },
  });

  // Update drill mutation
  const updateDrillMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Drill> & { id: string }) => {
      const { data, error } = await supabase
        .from('drills')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drills'] });
      toast({ title: 'Drill updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update drill', description: error.message, variant: 'destructive' });
    },
  });

  // Delete drill mutation
  const deleteDrillMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('drills').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drills'] });
      toast({ title: 'Drill deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete drill', description: error.message, variant: 'destructive' });
    },
  });

  // Add participants mutation
  const addParticipantsMutation = useMutation({
    mutationFn: async (participants: Omit<DrillParticipant, 'id' | 'created_at' | 'profile'>[]) => {
      const { data, error } = await supabase
        .from('drill_participants')
        .insert(participants)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drill-participants'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to add participants', description: error.message, variant: 'destructive' });
    },
  });

  // Add equipment mutation
  const addEquipmentMutation = useMutation({
    mutationFn: async (equipment: Omit<DrillEquipment, 'id' | 'created_at'>[]) => {
      const { data, error } = await supabase
        .from('drill_equipment')
        .insert(equipment)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drill-equipment'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to add equipment', description: error.message, variant: 'destructive' });
    },
  });

  // Add emergency contact mutation
  const addContactMutation = useMutation({
    mutationFn: async (contact: Omit<EmergencyContact, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('emergency_contacts')
        .insert([contact])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emergency-contacts'] });
      toast({ title: 'Emergency contact added successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to add contact', description: error.message, variant: 'destructive' });
    },
  });

  // Update emergency contact mutation
  const updateContactMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EmergencyContact> & { id: string }) => {
      const { data, error } = await supabase
        .from('emergency_contacts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emergency-contacts'] });
      toast({ title: 'Emergency contact updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update contact', description: error.message, variant: 'destructive' });
    },
  });

  // Delete emergency contact mutation
  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('emergency_contacts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emergency-contacts'] });
      toast({ title: 'Emergency contact deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete contact', description: error.message, variant: 'destructive' });
    },
  });

  // Computed values
  const scheduledDrills = drills.filter(d => d.status === 'Scheduled');
  const completedDrills = drills.filter(d => d.status === 'Completed');
  const thisYearDrills = drills.filter(d => {
    const drillYear = new Date(d.drill_date_scheduled).getFullYear();
    return drillYear === new Date().getFullYear();
  });
  
  const nextScheduledDrill = scheduledDrills
    .filter(d => new Date(d.drill_date_scheduled) >= new Date())
    .sort((a, b) => new Date(a.drill_date_scheduled).getTime() - new Date(b.drill_date_scheduled).getTime())[0];

  return {
    drillTypes,
    drills,
    scheduledDrills,
    completedDrills,
    thisYearDrills,
    nextScheduledDrill,
    emergencyContacts,
    emergencyProcedures,
    isLoading: drillTypesLoading || drillsLoading || contactsLoading || proceduresLoading,
    addDrill: addDrillMutation.mutate,
    updateDrill: updateDrillMutation.mutate,
    deleteDrill: deleteDrillMutation.mutate,
    addParticipants: addParticipantsMutation.mutate,
    addEquipment: addEquipmentMutation.mutate,
    addContact: addContactMutation.mutate,
    updateContact: updateContactMutation.mutate,
    deleteContact: deleteContactMutation.mutate,
    isAddingDrill: addDrillMutation.isPending,
  };
}

// Hook for fetching drill details with participants, equipment, etc.
export function useDrillDetails(drillId: string | null) {
  const { data: participants = [], isLoading: participantsLoading } = useQuery({
    queryKey: ['drill-participants', drillId],
    queryFn: async () => {
      if (!drillId) return [];

      const { data, error } = await supabase
        .from('drill_participants')
        .select(`
          *,
          profile:profiles!drill_participants_user_id_fkey(user_id, first_name, last_name, rank)
        `)
        .eq('drill_id', drillId);

      if (error) throw error;
      return data as DrillParticipant[];
    },
    enabled: !!drillId,
  });

  const { data: evaluations = [], isLoading: evaluationsLoading } = useQuery({
    queryKey: ['drill-evaluations', drillId],
    queryFn: async () => {
      if (!drillId) return [];

      const { data, error } = await supabase
        .from('drill_evaluations')
        .select('*')
        .eq('drill_id', drillId)
        .order('objective_index');

      if (error) throw error;
      return data as DrillEvaluation[];
    },
    enabled: !!drillId,
  });

  const { data: deficiencies = [], isLoading: deficienciesLoading } = useQuery({
    queryKey: ['drill-deficiencies', drillId],
    queryFn: async () => {
      if (!drillId) return [];

      const { data, error } = await supabase
        .from('drill_deficiencies')
        .select('*')
        .eq('drill_id', drillId);

      if (error) throw error;
      return data as DrillDeficiency[];
    },
    enabled: !!drillId,
  });

  const { data: equipment = [], isLoading: equipmentLoading } = useQuery({
    queryKey: ['drill-equipment', drillId],
    queryFn: async () => {
      if (!drillId) return [];

      const { data, error } = await supabase
        .from('drill_equipment')
        .select('*')
        .eq('drill_id', drillId);

      if (error) throw error;
      return data as DrillEquipment[];
    },
    enabled: !!drillId,
  });

  return {
    participants,
    evaluations,
    deficiencies,
    equipment,
    isLoading: participantsLoading || evaluationsLoading || deficienciesLoading || equipmentLoading,
  };
}
