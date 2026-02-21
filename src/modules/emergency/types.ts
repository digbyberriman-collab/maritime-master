// Emergency Contact Details Types
// Single source of truth for emergency contacts data structures

export interface EmergencyTeamMember {
  id: string;
  name: string;
  position: string;
  phone: string;
  email: string;
  display_order: number;
}

export interface VesselEmergencyContacts {
  id: string;
  vessel_id: string;
  
  // Header & Instructions
  emergency_heading: string;
  primary_instruction: string;
  secondary_instruction: string;
  
  // Primary Contact
  primary_phone: string;
  primary_email: string;
  
  // Branding
  logo_url: string | null;
  
  // Versioning
  revision_number: number;
  revision_date: string;
  
  // Metadata
  updated_at: string;
  updated_by_name: string | null;
  
  // Team Members
  team_members: EmergencyTeamMember[];
}

export interface EmergencyTeamMemberFormData {
  name: string;
  position: string;
  phone: string;
  email: string;
  display_order: number;
}

export interface EmergencyContactsFormData {
  emergency_heading: string;
  primary_instruction: string;
  secondary_instruction: string;
  primary_phone: string;
  primary_email: string;
  logo_url: string | null;
  team_members: EmergencyTeamMemberFormData[];
}

export interface EmergencyContactsHistory {
  id: string;
  revision_number: number;
  revision_date: string;
  data_snapshot: {
    emergency_heading: string;
    primary_instruction: string;
    secondary_instruction: string;
    primary_phone: string;
    primary_email: string;
    logo_url: string | null;
    team_members: Array<{
      name: string;
      position: string;
      phone: string;
      email: string;
    }>;
  };
  change_summary: string | null;
  created_by_name: string | null;
  created_at: string;
}
