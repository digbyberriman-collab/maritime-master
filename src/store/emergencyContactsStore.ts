import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import type { 
  VesselEmergencyContacts, 
  EmergencyContactsFormData,
  EmergencyContactsHistory,
  EmergencyTeamMember
} from '@/types/emergency';
import type { Json } from '@/integrations/supabase/types';

interface EmergencyContactsState {
  // Data
  contacts: VesselEmergencyContacts | null;
  history: EmergencyContactsHistory[];
  
  // Loading
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  
  // Current vessel context
  currentVesselId: string | null;
  
  // Actions
  loadContacts: (vesselId: string) => Promise<void>;
  loadHistory: (contactId: string) => Promise<void>;
  saveContacts: (vesselId: string, companyId: string, data: EmergencyContactsFormData, changeSummary?: string) => Promise<void>;
  initializeFromDefaults: (vesselId: string, companyId: string) => Promise<boolean>;
  clear: () => void;
}

// Helper to parse team members from JSON
function parseTeamMembers(teamMembers: Json | null): EmergencyTeamMember[] {
  if (!teamMembers || !Array.isArray(teamMembers)) {
    return [];
  }
  return teamMembers.map((member) => {
    const m = member as Record<string, Json>;
    return {
      id: String(m.id || ''),
      name: String(m.name || ''),
      position: String(m.position || ''),
      phone: String(m.phone || ''),
      email: String(m.email || ''),
      display_order: Number(m.display_order || 0),
    };
  });
}

export const useEmergencyContactsStore = create<EmergencyContactsState>((set, get) => ({
  contacts: null,
  history: [],
  isLoading: false,
  isSaving: false,
  error: null,
  currentVesselId: null,

  loadContacts: async (vesselId) => {
    set({ isLoading: true, error: null, currentVesselId: vesselId });

    try {
      const { data, error } = await supabase.rpc('get_vessel_emergency_contacts', {
        p_vessel_id: vesselId,
      });

      if (error) throw error;

      // The RPC returns an array, we take the first (and only) result
      const contactData = data?.[0];
      
      if (contactData) {
        const contacts: VesselEmergencyContacts = {
          id: contactData.id,
          vessel_id: contactData.vessel_id,
          emergency_heading: contactData.emergency_heading,
          primary_instruction: contactData.primary_instruction,
          secondary_instruction: contactData.secondary_instruction,
          primary_phone: contactData.primary_phone,
          primary_email: contactData.primary_email,
          logo_url: contactData.logo_url,
          revision_number: contactData.revision_number,
          revision_date: contactData.revision_date,
          updated_at: contactData.updated_at,
          updated_by_name: contactData.updated_by_name,
          team_members: parseTeamMembers(contactData.team_members),
        };
        set({ contacts, isLoading: false });
      } else {
        set({ contacts: null, isLoading: false });
      }
    } catch (error) {
      console.error('Failed to load emergency contacts:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to load emergency contacts',
        isLoading: false,
      });
    }
  },

  loadHistory: async (contactId) => {
    try {
      const { data, error } = await supabase
        .from('emergency_contacts_history')
        .select('*')
        .eq('emergency_contact_id', contactId)
        .order('revision_number', { ascending: false });

      if (error) throw error;
      
      const history: EmergencyContactsHistory[] = (data || []).map((entry) => {
        const snapshot = entry.data_snapshot as Record<string, Json>;
        const teamMembersRaw = snapshot?.team_members;
        const teamMembers = Array.isArray(teamMembersRaw) 
          ? teamMembersRaw.map((m) => {
              const member = m as Record<string, Json>;
              return {
                name: String(member.name || ''),
                position: String(member.position || ''),
                phone: String(member.phone || ''),
                email: String(member.email || ''),
              };
            })
          : [];

        return {
          id: entry.id,
          revision_number: entry.revision_number,
          revision_date: entry.revision_date,
          data_snapshot: {
            emergency_heading: String(snapshot?.emergency_heading || ''),
            primary_instruction: String(snapshot?.primary_instruction || ''),
            secondary_instruction: String(snapshot?.secondary_instruction || ''),
            primary_phone: String(snapshot?.primary_phone || ''),
            primary_email: String(snapshot?.primary_email || ''),
            logo_url: snapshot?.logo_url ? String(snapshot.logo_url) : null,
            team_members: teamMembers,
          },
          change_summary: entry.change_summary,
          created_by_name: entry.created_by_name,
          created_at: entry.created_at,
        };
      });
      
      set({ history });
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  },

  saveContacts: async (vesselId, companyId, data, changeSummary) => {
    set({ isSaving: true, error: null });

    try {
      // Convert team_members to JSON-compatible format
      const teamMembersJson = data.team_members.map((m) => ({
        name: m.name,
        position: m.position,
        phone: m.phone,
        email: m.email,
        display_order: m.display_order,
      }));

      const { error } = await supabase.rpc('update_emergency_contacts', {
        p_vessel_id: vesselId,
        p_company_id: companyId,
        p_emergency_heading: data.emergency_heading,
        p_primary_instruction: data.primary_instruction,
        p_secondary_instruction: data.secondary_instruction,
        p_primary_phone: data.primary_phone,
        p_primary_email: data.primary_email,
        p_logo_url: data.logo_url,
        p_team_members: teamMembersJson as unknown as Json,
        p_change_summary: changeSummary || null,
      });

      if (error) throw error;

      // Reload contacts after save
      await get().loadContacts(vesselId);
      set({ isSaving: false });
    } catch (error) {
      console.error('Failed to save emergency contacts:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to save emergency contacts',
        isSaving: false,
      });
      throw error;
    }
  },

  initializeFromDefaults: async (vesselId, companyId) => {
    set({ isLoading: true, error: null });

    try {
      const { data, error } = await supabase.rpc('initialize_vessel_emergency_from_defaults', {
        p_vessel_id: vesselId,
        p_company_id: companyId,
      });

      if (error) throw error;
      
      // If data is null, no defaults were found
      if (data) {
        await get().loadContacts(vesselId);
        return true;
      }
      
      set({ isLoading: false });
      return false;
    } catch (error) {
      console.error('Failed to initialize from defaults:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to initialize contacts',
        isLoading: false,
      });
      return false;
    }
  },

  clear: () => {
    set({
      contacts: null,
      history: [],
      currentVesselId: null,
      error: null,
    });
  },
}));
