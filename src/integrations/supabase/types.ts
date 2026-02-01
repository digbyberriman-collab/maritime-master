export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          activity_type: string
          company_id: string
          created_at: string | null
          description: string | null
          id: string
          module: string | null
          performed_by: string | null
          performed_by_name: string | null
          record_id: string | null
          record_type: string | null
          title: string
          vessel_id: string | null
        }
        Insert: {
          activity_type: string
          company_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          module?: string | null
          performed_by?: string | null
          performed_by_name?: string | null
          record_id?: string | null
          record_type?: string | null
          title: string
          vessel_id?: string | null
        }
        Update: {
          activity_type?: string
          company_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          module?: string | null
          performed_by?: string | null
          performed_by_name?: string | null
          record_id?: string | null
          record_type?: string | null
          title?: string
          vessel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_action_log: {
        Row: {
          action_type: string
          actor_user_id: string
          after_json: Json | null
          before_json: Json | null
          created_at: string
          id: string
          ip_address: string | null
          reason: string | null
          target_crew_id: string | null
          target_user_id: string | null
          user_agent: string | null
        }
        Insert: {
          action_type: string
          actor_user_id: string
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          reason?: string | null
          target_crew_id?: string | null
          target_user_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action_type?: string
          actor_user_id?: string
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          reason?: string | null
          target_crew_id?: string | null
          target_user_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_action_log_target_crew_id_fkey"
            columns: ["target_crew_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_pins: {
        Row: {
          created_at: string
          failed_attempts: number | null
          id: string
          last_confirmed_at: string | null
          locked_until: string | null
          pin_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          failed_attempts?: number | null
          id?: string
          last_confirmed_at?: string | null
          locked_until?: string | null
          pin_hash: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          failed_attempts?: number | null
          id?: string
          last_confirmed_at?: string | null
          locked_until?: string | null
          pin_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ais_snapshots: {
        Row: {
          cog: number | null
          created_at: string | null
          heading: number | null
          id: string
          latitude: number | null
          longitude: number | null
          nav_status: string | null
          raw_data: Json | null
          sog: number | null
          source_provider: string | null
          timestamp_utc: string
          vessel_id: string
        }
        Insert: {
          cog?: number | null
          created_at?: string | null
          heading?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nav_status?: string | null
          raw_data?: Json | null
          sog?: number | null
          source_provider?: string | null
          timestamp_utc: string
          vessel_id: string
        }
        Update: {
          cog?: number | null
          created_at?: string | null
          heading?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nav_status?: string | null
          raw_data?: Json | null
          sog?: number | null
          source_provider?: string | null
          timestamp_utc?: string
          vessel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ais_snapshots_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          acknowledged_notes: string | null
          alert_type: string
          assigned_at: string | null
          assigned_by: string | null
          assigned_to_role: string | null
          assigned_to_user_id: string | null
          assignment_notes: string | null
          assignment_priority: string | null
          company_id: string
          created_at: string | null
          description: string | null
          due_at: string | null
          escalated_at: string | null
          escalated_to_user_ids: string[] | null
          escalation_level: number | null
          id: string
          incident_id: string | null
          is_direct_assignment: boolean | null
          last_snooze_reason: string | null
          metadata: Json | null
          owner_role: string | null
          owner_user_id: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity_color: Database["public"]["Enums"]["alert_severity"]
          snooze_count: number | null
          snoozed_at: string | null
          snoozed_by: string | null
          snoozed_until: string | null
          source_module: string | null
          status: Database["public"]["Enums"]["alert_status"] | null
          title: string
          updated_at: string | null
          vessel_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          acknowledged_notes?: string | null
          alert_type: string
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to_role?: string | null
          assigned_to_user_id?: string | null
          assignment_notes?: string | null
          assignment_priority?: string | null
          company_id: string
          created_at?: string | null
          description?: string | null
          due_at?: string | null
          escalated_at?: string | null
          escalated_to_user_ids?: string[] | null
          escalation_level?: number | null
          id?: string
          incident_id?: string | null
          is_direct_assignment?: boolean | null
          last_snooze_reason?: string | null
          metadata?: Json | null
          owner_role?: string | null
          owner_user_id?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity_color: Database["public"]["Enums"]["alert_severity"]
          snooze_count?: number | null
          snoozed_at?: string | null
          snoozed_by?: string | null
          snoozed_until?: string | null
          source_module?: string | null
          status?: Database["public"]["Enums"]["alert_status"] | null
          title: string
          updated_at?: string | null
          vessel_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          acknowledged_notes?: string | null
          alert_type?: string
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to_role?: string | null
          assigned_to_user_id?: string | null
          assignment_notes?: string | null
          assignment_priority?: string | null
          company_id?: string
          created_at?: string | null
          description?: string | null
          due_at?: string | null
          escalated_at?: string | null
          escalated_to_user_ids?: string[] | null
          escalation_level?: number | null
          id?: string
          incident_id?: string | null
          is_direct_assignment?: boolean | null
          last_snooze_reason?: string | null
          metadata?: Json | null
          owner_role?: string | null
          owner_user_id?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity_color?: Database["public"]["Enums"]["alert_severity"]
          snooze_count?: number | null
          snoozed_at?: string | null
          snoozed_by?: string | null
          snoozed_until?: string | null
          source_module?: string | null
          status?: Database["public"]["Enums"]["alert_status"] | null
          title?: string
          updated_at?: string | null
          vessel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "alerts_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "alerts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "alerts_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_findings: {
        Row: {
          audit_id: string
          closed_date: string | null
          closeout_evidence_urls: string[] | null
          created_at: string
          finding_description: string
          finding_number: string
          finding_type: string
          id: string
          ism_section: number
          objective_evidence: string
          requirement_text: string
          status: string
          updated_at: string
          verified_by: string | null
          vessel_response: string | null
        }
        Insert: {
          audit_id: string
          closed_date?: string | null
          closeout_evidence_urls?: string[] | null
          created_at?: string
          finding_description: string
          finding_number: string
          finding_type: string
          id?: string
          ism_section: number
          objective_evidence: string
          requirement_text: string
          status?: string
          updated_at?: string
          verified_by?: string | null
          vessel_response?: string | null
        }
        Update: {
          audit_id?: string
          closed_date?: string | null
          closeout_evidence_urls?: string[] | null
          created_at?: string
          finding_description?: string
          finding_number?: string
          finding_type?: string
          id?: string
          ism_section?: number
          objective_evidence?: string
          requirement_text?: string
          status?: string
          updated_at?: string
          verified_by?: string | null
          vessel_response?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_findings_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_findings_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_role: string | null
          actor_user_id: string | null
          changed_fields: Json | null
          entity_id: string
          entity_type: string
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          timestamp: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          changed_fields?: Json | null
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          timestamp?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          changed_fields?: Json | null
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          timestamp?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      audit_mode_access_log: {
        Row: {
          accessed_entity_id: string | null
          accessed_entity_type: string | null
          accessed_module: string | null
          action: string | null
          audit_session_id: string
          created_at: string | null
          id: string
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          accessed_entity_id?: string | null
          accessed_entity_type?: string | null
          accessed_module?: string | null
          action?: string | null
          audit_session_id: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          accessed_entity_id?: string | null
          accessed_entity_type?: string | null
          accessed_module?: string | null
          action?: string | null
          audit_session_id?: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_mode_access_log_audit_session_id_fkey"
            columns: ["audit_session_id"]
            isOneToOne: false
            referencedRelation: "audit_mode_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_mode_sessions: {
        Row: {
          access_token: string | null
          access_token_expires_at: string | null
          audit_party: string
          audit_party_name: string | null
          auditor_email: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          end_datetime: string
          id: string
          is_active: boolean | null
          redaction_rules: Json
          start_datetime: string
          updated_at: string | null
          vessel_id: string | null
          visible_modules: Json
        }
        Insert: {
          access_token?: string | null
          access_token_expires_at?: string | null
          audit_party: string
          audit_party_name?: string | null
          auditor_email?: string | null
          company_id: string
          created_at?: string | null
          created_by?: string | null
          end_datetime: string
          id?: string
          is_active?: boolean | null
          redaction_rules?: Json
          start_datetime: string
          updated_at?: string | null
          vessel_id?: string | null
          visible_modules?: Json
        }
        Update: {
          access_token?: string | null
          access_token_expires_at?: string | null
          audit_party?: string
          audit_party_name?: string | null
          auditor_email?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          end_datetime?: string
          id?: string
          is_active?: boolean | null
          redaction_rules?: Json
          start_datetime?: string
          updated_at?: string | null
          vessel_id?: string | null
          visible_modules?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_mode_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_mode_sessions_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      audits: {
        Row: {
          actual_end_date: string | null
          actual_start_date: string | null
          audit_number: string
          audit_report_url: string | null
          audit_scope: string
          audit_team: string[] | null
          audit_type: string
          company_id: string
          created_at: string
          external_auditor_name: string | null
          external_auditor_org: string | null
          id: string
          ism_sections_covered: number[] | null
          lead_auditor_id: string | null
          notes: string | null
          overall_result: string | null
          scheduled_date: string
          status: string
          updated_at: string
          vessel_id: string | null
        }
        Insert: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          audit_number: string
          audit_report_url?: string | null
          audit_scope: string
          audit_team?: string[] | null
          audit_type: string
          company_id: string
          created_at?: string
          external_auditor_name?: string | null
          external_auditor_org?: string | null
          id?: string
          ism_sections_covered?: number[] | null
          lead_auditor_id?: string | null
          notes?: string | null
          overall_result?: string | null
          scheduled_date: string
          status?: string
          updated_at?: string
          vessel_id?: string | null
        }
        Update: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          audit_number?: string
          audit_report_url?: string | null
          audit_scope?: string
          audit_team?: string[] | null
          audit_type?: string
          company_id?: string
          created_at?: string
          external_auditor_name?: string | null
          external_auditor_org?: string | null
          id?: string
          ism_sections_covered?: number[] | null
          lead_auditor_id?: string | null
          notes?: string | null
          overall_result?: string | null
          scheduled_date?: string
          status?: string
          updated_at?: string
          vessel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audits_lead_auditor_id_fkey"
            columns: ["lead_auditor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "audits_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_date: string
          alert_type: string
          certificate_id: string
          created_at: string
          id: string
          sent_at: string | null
          sent_to: string[] | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_date: string
          alert_type: string
          certificate_id: string
          created_at?: string
          id?: string
          sent_at?: string | null
          sent_to?: string[] | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_date?: string
          alert_type?: string
          certificate_id?: string
          created_at?: string
          id?: string
          sent_at?: string | null
          sent_to?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "certificate_alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "certificate_alerts_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          alert_days: number | null
          certificate_category: string | null
          certificate_name: string
          certificate_number: string
          certificate_type: string
          company_id: string
          created_at: string
          expiry_date: string
          file_url: string | null
          id: string
          issue_date: string
          issuing_authority: string
          next_survey_date: string | null
          notes: string | null
          status: string
          superseded_by: string | null
          updated_at: string
          user_id: string | null
          vessel_id: string | null
        }
        Insert: {
          alert_days?: number | null
          certificate_category?: string | null
          certificate_name: string
          certificate_number: string
          certificate_type: string
          company_id: string
          created_at?: string
          expiry_date: string
          file_url?: string | null
          id?: string
          issue_date: string
          issuing_authority: string
          next_survey_date?: string | null
          notes?: string | null
          status?: string
          superseded_by?: string | null
          updated_at?: string
          user_id?: string | null
          vessel_id?: string | null
        }
        Update: {
          alert_days?: number | null
          certificate_category?: string | null
          certificate_name?: string
          certificate_number?: string
          certificate_type?: string
          company_id?: string
          created_at?: string
          expiry_date?: string
          file_url?: string | null
          id?: string
          issue_date?: string
          issuing_authority?: string
          next_survey_date?: string | null
          notes?: string | null
          status?: string
          superseded_by?: string | null
          updated_at?: string
          user_id?: string | null
          vessel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "certificates_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          brand_color: string | null
          client_display_name: string | null
          client_logo_url: string | null
          company_type: string | null
          created_at: string
          crewing_manager_name: string | null
          crewing_manager_phone: string | null
          dpa_email: string | null
          dpa_name: string | null
          dpa_phone_24_7: string | null
          email: string | null
          id: string
          imo_company_number: string | null
          name: string
          phone: string | null
          technical_manager_name: string | null
          technical_manager_phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          brand_color?: string | null
          client_display_name?: string | null
          client_logo_url?: string | null
          company_type?: string | null
          created_at?: string
          crewing_manager_name?: string | null
          crewing_manager_phone?: string | null
          dpa_email?: string | null
          dpa_name?: string | null
          dpa_phone_24_7?: string | null
          email?: string | null
          id?: string
          imo_company_number?: string | null
          name: string
          phone?: string | null
          technical_manager_name?: string | null
          technical_manager_phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          brand_color?: string | null
          client_display_name?: string | null
          client_logo_url?: string | null
          company_type?: string | null
          created_at?: string
          crewing_manager_name?: string | null
          crewing_manager_phone?: string | null
          dpa_email?: string | null
          dpa_name?: string | null
          dpa_phone_24_7?: string | null
          email?: string | null
          id?: string
          imo_company_number?: string | null
          name?: string
          phone?: string | null
          technical_manager_name?: string | null
          technical_manager_phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      compliance_access_log: {
        Row: {
          access_granted: boolean | null
          accessed_fields: string[] | null
          action: string
          audit_session_id: string | null
          company_id: string
          created_at: string | null
          denial_reason: string | null
          entity_id: string
          entity_type: string
          id: string
          ip_address: string | null
          is_audit_mode: boolean | null
          module: string
          user_agent: string | null
          user_id: string
          user_role: string
        }
        Insert: {
          access_granted?: boolean | null
          accessed_fields?: string[] | null
          action: string
          audit_session_id?: string | null
          company_id: string
          created_at?: string | null
          denial_reason?: string | null
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: string | null
          is_audit_mode?: boolean | null
          module: string
          user_agent?: string | null
          user_id: string
          user_role: string
        }
        Update: {
          access_granted?: boolean | null
          accessed_fields?: string[] | null
          action?: string
          audit_session_id?: string | null
          company_id?: string
          created_at?: string | null
          denial_reason?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: string | null
          is_audit_mode?: boolean | null
          module?: string
          user_agent?: string | null
          user_id?: string
          user_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_access_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_access_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      corrective_actions: {
        Row: {
          action_number: string
          action_type: string
          assigned_by: string
          assigned_to: string
          company_id: string
          completion_date: string | null
          completion_notes: string | null
          created_at: string
          description: string
          due_date: string
          evidence_urls: string[] | null
          finding_id: string | null
          id: string
          incident_id: string | null
          status: string | null
          updated_at: string
          verification_notes: string | null
          verified_by: string | null
          verified_date: string | null
        }
        Insert: {
          action_number: string
          action_type: string
          assigned_by: string
          assigned_to: string
          company_id: string
          completion_date?: string | null
          completion_notes?: string | null
          created_at?: string
          description: string
          due_date: string
          evidence_urls?: string[] | null
          finding_id?: string | null
          id?: string
          incident_id?: string | null
          status?: string | null
          updated_at?: string
          verification_notes?: string | null
          verified_by?: string | null
          verified_date?: string | null
        }
        Update: {
          action_number?: string
          action_type?: string
          assigned_by?: string
          assigned_to?: string
          company_id?: string
          completion_date?: string | null
          completion_notes?: string | null
          created_at?: string
          description?: string
          due_date?: string
          evidence_urls?: string[] | null
          finding_id?: string | null
          id?: string
          incident_id?: string | null
          status?: string | null
          updated_at?: string
          verification_notes?: string | null
          verified_by?: string | null
          verified_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "corrective_actions_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "corrective_actions_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "corrective_actions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrective_actions_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrective_actions_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      crew_assignments: {
        Row: {
          assignment_type: string | null
          created_at: string
          created_by: string | null
          department: string | null
          end_date: string | null
          id: string
          is_current: boolean | null
          join_date: string
          leave_date: string | null
          position: string
          start_date: string | null
          updated_at: string
          user_id: string
          vessel_id: string
        }
        Insert: {
          assignment_type?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          end_date?: string | null
          id?: string
          is_current?: boolean | null
          join_date: string
          leave_date?: string | null
          position: string
          start_date?: string | null
          updated_at?: string
          user_id: string
          vessel_id: string
        }
        Update: {
          assignment_type?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          end_date?: string | null
          id?: string
          is_current?: boolean | null
          join_date?: string
          leave_date?: string | null
          position?: string
          start_date?: string | null
          updated_at?: string
          user_id?: string
          vessel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "crew_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "crew_assignments_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_attachments: {
        Row: {
          attachment_type: string
          created_at: string
          description: string | null
          file_name: string
          file_size: number
          file_url: string
          id: string
          mime_type: string | null
          updated_at: string
          uploaded_by: string | null
          user_id: string
        }
        Insert: {
          attachment_type: string
          created_at?: string
          description?: string | null
          file_name: string
          file_size?: number
          file_url: string
          id?: string
          mime_type?: string | null
          updated_at?: string
          uploaded_by?: string | null
          user_id: string
        }
        Update: {
          attachment_type?: string
          created_at?: string
          description?: string | null
          file_name?: string
          file_size?: number
          file_url?: string
          id?: string
          mime_type?: string | null
          updated_at?: string
          uploaded_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "crew_attachments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      crew_certificates: {
        Row: {
          certificate_name: string
          certificate_number: string | null
          certificate_type: string
          created_at: string
          created_by: string | null
          expiry_date: string | null
          file_name: string | null
          file_size: number | null
          file_url: string | null
          id: string
          issue_date: string | null
          issuing_authority: string | null
          notes: string | null
          status: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          certificate_name: string
          certificate_number?: string | null
          certificate_type: string
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          issue_date?: string | null
          issuing_authority?: string | null
          notes?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          certificate_name?: string
          certificate_number?: string | null
          certificate_type?: string
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          issue_date?: string | null
          issuing_authority?: string | null
          notes?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_certificates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "crew_certificates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "crew_certificates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      crew_tasks: {
        Row: {
          assigned_by: string
          assigned_to: string
          company_id: string
          completed_at: string | null
          completion_notes: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          priority: string
          related_document_id: string | null
          related_form_id: string | null
          started_at: string | null
          status: string
          task_type: string
          title: string
          updated_at: string
          verification_required: boolean | null
          verified_at: string | null
          verified_by: string | null
          vessel_id: string | null
        }
        Insert: {
          assigned_by: string
          assigned_to: string
          company_id: string
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          related_document_id?: string | null
          related_form_id?: string | null
          started_at?: string | null
          status?: string
          task_type: string
          title: string
          updated_at?: string
          verification_required?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
          vessel_id?: string | null
        }
        Update: {
          assigned_by?: string
          assigned_to?: string
          company_id?: string
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          related_document_id?: string | null
          related_form_id?: string | null
          started_at?: string | null
          status?: string
          task_type?: string
          title?: string
          updated_at?: string
          verification_required?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
          vessel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crew_tasks_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "crew_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "crew_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_tasks_related_document_id_fkey"
            columns: ["related_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_tasks_related_form_id_fkey"
            columns: ["related_form_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_tasks_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "crew_tasks_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_travel_documents: {
        Row: {
          company_id: string
          created_at: string | null
          crew_member_id: string
          destination_location: string | null
          document_type: string
          extracted_data: Json | null
          extraction_error: string | null
          extraction_status: string | null
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          origin_location: string | null
          original_file_path: string
          original_filename: string
          standardised_file_path: string | null
          standardised_filename: string | null
          travel_date: string | null
          travel_record_id: string | null
          updated_at: string | null
          uploaded_by: string | null
          valid_from: string | null
          valid_until: string | null
          verified: boolean | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          crew_member_id: string
          destination_location?: string | null
          document_type: string
          extracted_data?: Json | null
          extraction_error?: string | null
          extraction_status?: string | null
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          origin_location?: string | null
          original_file_path: string
          original_filename: string
          standardised_file_path?: string | null
          standardised_filename?: string | null
          travel_date?: string | null
          travel_record_id?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          valid_from?: string | null
          valid_until?: string | null
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          crew_member_id?: string
          destination_location?: string | null
          document_type?: string
          extracted_data?: Json | null
          extraction_error?: string | null
          extraction_status?: string | null
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          origin_location?: string | null
          original_file_path?: string
          original_filename?: string
          standardised_file_path?: string | null
          standardised_filename?: string | null
          travel_date?: string | null
          travel_record_id?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          valid_from?: string | null
          valid_until?: string | null
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crew_travel_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_travel_documents_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "crew_travel_documents_travel_record_id_fkey"
            columns: ["travel_record_id"]
            isOneToOne: false
            referencedRelation: "crew_travel_records"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_travel_records: {
        Row: {
          accommodation_id: string | null
          accommodation_required: boolean | null
          arrival_date: string | null
          booking_reference: string | null
          company_id: string
          cost_currency: string | null
          created_at: string | null
          created_by: string | null
          crew_member_id: string
          departure_date: string
          destination_airport_code: string | null
          destination_city: string | null
          destination_country: string | null
          handover_notes: string | null
          id: string
          joining_vessel: boolean | null
          leaving_vessel: boolean | null
          notes: string | null
          origin_airport_code: string | null
          origin_city: string | null
          origin_country: string | null
          pickup_location: string | null
          pickup_required: boolean | null
          pickup_time: string | null
          status: string
          total_cost: number | null
          travel_agent: string | null
          travel_type: string
          updated_at: string | null
          vessel_id: string | null
        }
        Insert: {
          accommodation_id?: string | null
          accommodation_required?: boolean | null
          arrival_date?: string | null
          booking_reference?: string | null
          company_id: string
          cost_currency?: string | null
          created_at?: string | null
          created_by?: string | null
          crew_member_id: string
          departure_date: string
          destination_airport_code?: string | null
          destination_city?: string | null
          destination_country?: string | null
          handover_notes?: string | null
          id?: string
          joining_vessel?: boolean | null
          leaving_vessel?: boolean | null
          notes?: string | null
          origin_airport_code?: string | null
          origin_city?: string | null
          origin_country?: string | null
          pickup_location?: string | null
          pickup_required?: boolean | null
          pickup_time?: string | null
          status?: string
          total_cost?: number | null
          travel_agent?: string | null
          travel_type: string
          updated_at?: string | null
          vessel_id?: string | null
        }
        Update: {
          accommodation_id?: string | null
          accommodation_required?: boolean | null
          arrival_date?: string | null
          booking_reference?: string | null
          company_id?: string
          cost_currency?: string | null
          created_at?: string | null
          created_by?: string | null
          crew_member_id?: string
          departure_date?: string
          destination_airport_code?: string | null
          destination_city?: string | null
          destination_country?: string | null
          handover_notes?: string | null
          id?: string
          joining_vessel?: boolean | null
          leaving_vessel?: boolean | null
          notes?: string | null
          origin_airport_code?: string | null
          origin_city?: string | null
          origin_country?: string | null
          pickup_location?: string | null
          pickup_required?: boolean | null
          pickup_time?: string | null
          status?: string
          total_cost?: number | null
          travel_agent?: string | null
          travel_type?: string
          updated_at?: string | null
          vessel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crew_travel_records_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "quarantine_houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_travel_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_travel_records_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "crew_travel_records_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_crew_snapshots: {
        Row: {
          captain_name: string | null
          captain_user_id: string | null
          computed_at: string | null
          crew_onboard_count: number
          id: string
          is_acting_captain: boolean | null
          overridden_at: string | null
          overridden_by: string | null
          override_reason: string | null
          snapshot_date: string
          source: string | null
          vessel_id: string
        }
        Insert: {
          captain_name?: string | null
          captain_user_id?: string | null
          computed_at?: string | null
          crew_onboard_count: number
          id?: string
          is_acting_captain?: boolean | null
          overridden_at?: string | null
          overridden_by?: string | null
          override_reason?: string | null
          snapshot_date: string
          source?: string | null
          vessel_id: string
        }
        Update: {
          captain_name?: string | null
          captain_user_id?: string | null
          computed_at?: string | null
          crew_onboard_count?: number
          id?: string
          is_acting_captain?: boolean | null
          overridden_at?: string | null
          overridden_by?: string | null
          override_reason?: string | null
          snapshot_date?: string
          source?: string | null
          vessel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_crew_snapshots_captain_user_id_fkey"
            columns: ["captain_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "daily_crew_snapshots_overridden_by_fkey"
            columns: ["overridden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "daily_crew_snapshots_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      data_retention_policies: {
        Row: {
          auto_archive: boolean | null
          company_id: string
          created_at: string | null
          data_owner: string
          gdpr_lawful_basis: Database["public"]["Enums"]["gdpr_lawful_basis"]
          gdpr_purpose: string
          id: string
          record_type: Database["public"]["Enums"]["hr_record_type"]
          require_dpa_approval_for_deletion: boolean | null
          retention_trigger: string
          retention_years: number
          updated_at: string | null
        }
        Insert: {
          auto_archive?: boolean | null
          company_id: string
          created_at?: string | null
          data_owner?: string
          gdpr_lawful_basis: Database["public"]["Enums"]["gdpr_lawful_basis"]
          gdpr_purpose: string
          id?: string
          record_type: Database["public"]["Enums"]["hr_record_type"]
          require_dpa_approval_for_deletion?: boolean | null
          retention_trigger?: string
          retention_years: number
          updated_at?: string | null
        }
        Update: {
          auto_archive?: boolean | null
          company_id?: string
          created_at?: string | null
          data_owner?: string
          gdpr_lawful_basis?: Database["public"]["Enums"]["gdpr_lawful_basis"]
          gdpr_purpose?: string
          id?: string
          record_type?: Database["public"]["Enums"]["hr_record_type"]
          require_dpa_approval_for_deletion?: boolean | null
          retention_trigger?: string
          retention_years?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_retention_policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      defects: {
        Row: {
          actual_completion_date: string | null
          attachments: string[] | null
          closed_by_id: string | null
          created_at: string
          defect_description: string
          defect_number: string
          equipment_id: string | null
          id: string
          linked_maintenance_task_id: string | null
          operational_impact: string
          permanent_repair_plan: string | null
          priority: string
          reported_by_id: string
          reported_date: string
          status: string
          target_completion_date: string | null
          temporary_repair: string | null
          updated_at: string
          vessel_id: string
        }
        Insert: {
          actual_completion_date?: string | null
          attachments?: string[] | null
          closed_by_id?: string | null
          created_at?: string
          defect_description: string
          defect_number: string
          equipment_id?: string | null
          id?: string
          linked_maintenance_task_id?: string | null
          operational_impact?: string
          permanent_repair_plan?: string | null
          priority?: string
          reported_by_id: string
          reported_date?: string
          status?: string
          target_completion_date?: string | null
          temporary_repair?: string | null
          updated_at?: string
          vessel_id: string
        }
        Update: {
          actual_completion_date?: string | null
          attachments?: string[] | null
          closed_by_id?: string | null
          created_at?: string
          defect_description?: string
          defect_number?: string
          equipment_id?: string | null
          id?: string
          linked_maintenance_task_id?: string | null
          operational_impact?: string
          permanent_repair_plan?: string | null
          priority?: string
          reported_by_id?: string
          reported_date?: string
          status?: string
          target_completion_date?: string | null
          temporary_repair?: string | null
          updated_at?: string
          vessel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "defects_closed_by_id_fkey"
            columns: ["closed_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "defects_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defects_linked_maintenance_task_id_fkey"
            columns: ["linked_maintenance_task_id"]
            isOneToOne: false
            referencedRelation: "maintenance_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defects_reported_by_id_fkey"
            columns: ["reported_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "defects_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      document_acknowledgments: {
        Row: {
          acknowledged_at: string
          document_id: string
          id: string
          ip_address: string | null
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          document_id: string
          id?: string
          ip_address?: string | null
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          document_id?: string
          id?: string
          ip_address?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_acknowledgments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_acknowledgments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      document_categories: {
        Row: {
          color: string
          created_at: string
          display_order: number
          icon: string
          id: string
          name: string
        }
        Insert: {
          color: string
          created_at?: string
          display_order?: number
          icon: string
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          display_order?: number
          icon?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      document_naming_rules: {
        Row: {
          company_id: string | null
          created_at: string | null
          document_type: string
          folder_structure: string
          id: string
          is_active: boolean | null
          naming_pattern: string
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          document_type: string
          folder_structure: string
          id?: string
          is_active?: boolean | null
          naming_pattern: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          document_type?: string
          folder_structure?: string
          id?: string
          is_active?: boolean | null
          naming_pattern?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_naming_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          change_summary: string | null
          created_at: string
          created_by: string
          document_id: string
          file_url: string
          id: string
          revision: string
        }
        Insert: {
          change_summary?: string | null
          created_at?: string
          created_by: string
          document_id: string
          file_url: string
          id?: string
          revision: string
        }
        Update: {
          change_summary?: string | null
          created_at?: string
          created_by?: string
          document_id?: string
          file_url?: string
          id?: string
          revision?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          approved_date: string | null
          approver_id: string | null
          author_id: string
          category_id: string
          company_id: string
          created_at: string
          description: string | null
          document_number: string
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id: string
          is_mandatory_read: boolean
          ism_sections: number[] | null
          issue_date: string | null
          language: string
          next_review_date: string | null
          reviewer_id: string | null
          revision: string
          status: string
          tags: string[] | null
          title: string
          updated_at: string
          vessel_id: string | null
        }
        Insert: {
          approved_date?: string | null
          approver_id?: string | null
          author_id: string
          category_id: string
          company_id: string
          created_at?: string
          description?: string | null
          document_number: string
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id?: string
          is_mandatory_read?: boolean
          ism_sections?: number[] | null
          issue_date?: string | null
          language?: string
          next_review_date?: string | null
          reviewer_id?: string | null
          revision?: string
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string
          vessel_id?: string | null
        }
        Update: {
          approved_date?: string | null
          approver_id?: string | null
          author_id?: string
          category_id?: string
          company_id?: string
          created_at?: string
          description?: string | null
          document_number?: string
          file_name?: string
          file_size?: number
          file_type?: string
          file_url?: string
          id?: string
          is_mandatory_read?: boolean
          ism_sections?: number[] | null
          issue_date?: string | null
          language?: string
          next_review_date?: string | null
          reviewer_id?: string | null
          revision?: string
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          vessel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "documents_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "documents_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "document_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "documents_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      drill_deficiencies: {
        Row: {
          corrective_action_id: string | null
          created_at: string
          deficiency_description: string
          drill_id: string
          id: string
          photo_urls: string[] | null
          severity: string
        }
        Insert: {
          corrective_action_id?: string | null
          created_at?: string
          deficiency_description: string
          drill_id: string
          id?: string
          photo_urls?: string[] | null
          severity: string
        }
        Update: {
          corrective_action_id?: string | null
          created_at?: string
          deficiency_description?: string
          drill_id?: string
          id?: string
          photo_urls?: string[] | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "drill_deficiencies_corrective_action_id_fkey"
            columns: ["corrective_action_id"]
            isOneToOne: false
            referencedRelation: "corrective_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drill_deficiencies_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "drills"
            referencedColumns: ["id"]
          },
        ]
      }
      drill_equipment: {
        Row: {
          created_at: string
          drill_id: string
          equipment_name: string
          equipment_status: string | null
          equipment_used: boolean | null
          id: string
          notes: string | null
        }
        Insert: {
          created_at?: string
          drill_id: string
          equipment_name: string
          equipment_status?: string | null
          equipment_used?: boolean | null
          id?: string
          notes?: string | null
        }
        Update: {
          created_at?: string
          drill_id?: string
          equipment_name?: string
          equipment_status?: string | null
          equipment_used?: boolean | null
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drill_equipment_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "drills"
            referencedColumns: ["id"]
          },
        ]
      }
      drill_evaluations: {
        Row: {
          achieved: boolean | null
          created_at: string
          drill_id: string
          evaluator_id: string | null
          id: string
          notes: string | null
          objective_index: number
          objective_text: string
        }
        Insert: {
          achieved?: boolean | null
          created_at?: string
          drill_id: string
          evaluator_id?: string | null
          id?: string
          notes?: string | null
          objective_index: number
          objective_text: string
        }
        Update: {
          achieved?: boolean | null
          created_at?: string
          drill_id?: string
          evaluator_id?: string | null
          id?: string
          notes?: string | null
          objective_index?: number
          objective_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "drill_evaluations_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "drills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drill_evaluations_evaluator_id_fkey"
            columns: ["evaluator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      drill_participants: {
        Row: {
          absent_reason: string | null
          attended: boolean | null
          comments: string | null
          created_at: string
          drill_id: string
          expected_to_attend: boolean
          id: string
          late_arrival_minutes: number | null
          performance_rating: number | null
          station_assignment: string | null
          user_id: string
        }
        Insert: {
          absent_reason?: string | null
          attended?: boolean | null
          comments?: string | null
          created_at?: string
          drill_id: string
          expected_to_attend?: boolean
          id?: string
          late_arrival_minutes?: number | null
          performance_rating?: number | null
          station_assignment?: string | null
          user_id: string
        }
        Update: {
          absent_reason?: string | null
          attended?: boolean | null
          comments?: string | null
          created_at?: string
          drill_id?: string
          expected_to_attend?: boolean
          id?: string
          late_arrival_minutes?: number | null
          performance_rating?: number | null
          station_assignment?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drill_participants_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "drills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drill_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      drill_types: {
        Row: {
          category: string
          created_at: string
          drill_name: string
          id: string
          is_active: boolean
          minimum_frequency: number
          solas_reference: string | null
        }
        Insert: {
          category: string
          created_at?: string
          drill_name: string
          id?: string
          is_active?: boolean
          minimum_frequency: number
          solas_reference?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          drill_name?: string
          id?: string
          is_active?: boolean
          minimum_frequency?: number
          solas_reference?: string | null
        }
        Relationships: []
      }
      drills: {
        Row: {
          cancelled_reason: string | null
          conducted_by_id: string | null
          created_at: string
          drill_date_actual: string | null
          drill_date_scheduled: string
          drill_duration_minutes: number | null
          drill_number: string
          drill_type_id: string
          id: string
          lessons_learned_improvement: string | null
          lessons_learned_positive: string | null
          location: string | null
          objectives: string[] | null
          overall_rating: number | null
          recommendations: string | null
          scenario_description: string
          status: string
          updated_at: string
          vessel_id: string
          weather_conditions: string | null
        }
        Insert: {
          cancelled_reason?: string | null
          conducted_by_id?: string | null
          created_at?: string
          drill_date_actual?: string | null
          drill_date_scheduled: string
          drill_duration_minutes?: number | null
          drill_number: string
          drill_type_id: string
          id?: string
          lessons_learned_improvement?: string | null
          lessons_learned_positive?: string | null
          location?: string | null
          objectives?: string[] | null
          overall_rating?: number | null
          recommendations?: string | null
          scenario_description: string
          status?: string
          updated_at?: string
          vessel_id: string
          weather_conditions?: string | null
        }
        Update: {
          cancelled_reason?: string | null
          conducted_by_id?: string | null
          created_at?: string
          drill_date_actual?: string | null
          drill_date_scheduled?: string
          drill_duration_minutes?: number | null
          drill_number?: string
          drill_type_id?: string
          id?: string
          lessons_learned_improvement?: string | null
          lessons_learned_positive?: string | null
          location?: string | null
          objectives?: string[] | null
          overall_rating?: number | null
          recommendations?: string | null
          scenario_description?: string
          status?: string
          updated_at?: string
          vessel_id?: string
          weather_conditions?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drills_conducted_by_id_fkey"
            columns: ["conducted_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "drills_drill_type_id_fkey"
            columns: ["drill_type_id"]
            isOneToOne: false
            referencedRelation: "drill_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drills_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_contacts: {
        Row: {
          available_24_7: boolean
          contact_category: string
          contact_person: string | null
          created_at: string
          display_order: number
          email: string | null
          id: string
          notes: string | null
          organization_name: string
          phone_primary: string
          phone_secondary: string | null
          vessel_id: string
        }
        Insert: {
          available_24_7?: boolean
          contact_category: string
          contact_person?: string | null
          created_at?: string
          display_order?: number
          email?: string | null
          id?: string
          notes?: string | null
          organization_name: string
          phone_primary: string
          phone_secondary?: string | null
          vessel_id: string
        }
        Update: {
          available_24_7?: boolean
          contact_category?: string
          contact_person?: string | null
          created_at?: string
          display_order?: number
          email?: string | null
          id?: string
          notes?: string | null
          organization_name?: string
          phone_primary?: string
          phone_secondary?: string | null
          vessel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_contacts_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_contacts_history: {
        Row: {
          change_summary: string | null
          created_at: string | null
          created_by: string | null
          created_by_name: string | null
          data_snapshot: Json
          emergency_contact_id: string
          id: string
          revision_date: string
          revision_number: number
        }
        Insert: {
          change_summary?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_name?: string | null
          data_snapshot: Json
          emergency_contact_id: string
          id?: string
          revision_date: string
          revision_number: number
        }
        Update: {
          change_summary?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_name?: string | null
          data_snapshot?: Json
          emergency_contact_id?: string
          id?: string
          revision_date?: string
          revision_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "emergency_contacts_history_emergency_contact_id_fkey"
            columns: ["emergency_contact_id"]
            isOneToOne: false
            referencedRelation: "vessel_emergency_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_procedures: {
        Row: {
          created_at: string
          emergency_type: string
          id: string
          key_actions: string[] | null
          muster_station: string | null
          procedure_document_id: string | null
          responsible_officer: string | null
          vessel_id: string
        }
        Insert: {
          created_at?: string
          emergency_type: string
          id?: string
          key_actions?: string[] | null
          muster_station?: string | null
          procedure_document_id?: string | null
          responsible_officer?: string | null
          vessel_id: string
        }
        Update: {
          created_at?: string
          emergency_type?: string
          id?: string
          key_actions?: string[] | null
          muster_station?: string | null
          procedure_document_id?: string | null
          responsible_officer?: string | null
          vessel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_procedures_procedure_document_id_fkey"
            columns: ["procedure_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_procedures_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_team_members: {
        Row: {
          created_at: string | null
          display_order: number
          email: string
          emergency_contact_id: string
          id: string
          is_active: boolean | null
          name: string
          phone: string
          position: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number
          email: string
          emergency_contact_id: string
          id?: string
          is_active?: boolean | null
          name: string
          phone: string
          position: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number
          email?: string
          emergency_contact_id?: string
          id?: string
          is_active?: boolean | null
          name?: string
          phone?: string
          position?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emergency_team_members_emergency_contact_id_fkey"
            columns: ["emergency_contact_id"]
            isOneToOne: false
            referencedRelation: "vessel_emergency_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          category_id: string
          created_at: string
          criticality: string
          equipment_code: string
          equipment_name: string
          id: string
          installation_date: string | null
          location: string | null
          manual_url: string | null
          manufacturer: string | null
          model: string | null
          photo_url: string | null
          running_hours_last_updated: string | null
          running_hours_total: number
          serial_number: string | null
          specifications: Json | null
          status: string
          updated_at: string
          vessel_id: string
          warranty_expiry: string | null
        }
        Insert: {
          category_id: string
          created_at?: string
          criticality?: string
          equipment_code: string
          equipment_name: string
          id?: string
          installation_date?: string | null
          location?: string | null
          manual_url?: string | null
          manufacturer?: string | null
          model?: string | null
          photo_url?: string | null
          running_hours_last_updated?: string | null
          running_hours_total?: number
          serial_number?: string | null
          specifications?: Json | null
          status?: string
          updated_at?: string
          vessel_id: string
          warranty_expiry?: string | null
        }
        Update: {
          category_id?: string
          created_at?: string
          criticality?: string
          equipment_code?: string
          equipment_name?: string
          id?: string
          installation_date?: string | null
          location?: string | null
          manual_url?: string | null
          manufacturer?: string | null
          model?: string | null
          photo_url?: string | null
          running_hours_last_updated?: string | null
          running_hours_total?: number
          serial_number?: string | null
          specifications?: Json | null
          status?: string
          updated_at?: string
          vessel_id?: string
          warranty_expiry?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "equipment_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_categories: {
        Row: {
          category_name: string
          color: string
          created_at: string
          display_order: number
          icon: string
          id: string
          parent_category_id: string | null
        }
        Insert: {
          category_name: string
          color?: string
          created_at?: string
          display_order?: number
          icon?: string
          id?: string
          parent_category_id?: string | null
        }
        Update: {
          category_name?: string
          color?: string
          created_at?: string
          display_order?: number
          icon?: string
          id?: string
          parent_category_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_categories_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "equipment_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      familiarization_checklist_items: {
        Row: {
          completed: boolean
          completed_by_id: string | null
          completed_date: string | null
          evidence_url: string | null
          familiarization_id: string
          id: string
          item_order: number
          item_text: string
          notes: string | null
          section_name: string
        }
        Insert: {
          completed?: boolean
          completed_by_id?: string | null
          completed_date?: string | null
          evidence_url?: string | null
          familiarization_id: string
          id?: string
          item_order?: number
          item_text: string
          notes?: string | null
          section_name: string
        }
        Update: {
          completed?: boolean
          completed_by_id?: string | null
          completed_date?: string | null
          evidence_url?: string | null
          familiarization_id?: string
          id?: string
          item_order?: number
          item_text?: string
          notes?: string | null
          section_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "familiarization_checklist_items_completed_by_id_fkey"
            columns: ["completed_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "familiarization_checklist_items_familiarization_id_fkey"
            columns: ["familiarization_id"]
            isOneToOne: false
            referencedRelation: "familiarization_records"
            referencedColumns: ["id"]
          },
        ]
      }
      familiarization_records: {
        Row: {
          actual_completion_date: string | null
          completion_percentage: number
          created_at: string
          id: string
          join_date: string
          status: string
          supervisor_id: string | null
          target_completion_date: string
          template_id: string | null
          updated_at: string
          user_id: string
          vessel_id: string
        }
        Insert: {
          actual_completion_date?: string | null
          completion_percentage?: number
          created_at?: string
          id?: string
          join_date: string
          status?: string
          supervisor_id?: string | null
          target_completion_date: string
          template_id?: string | null
          updated_at?: string
          user_id: string
          vessel_id: string
        }
        Update: {
          actual_completion_date?: string | null
          completion_percentage?: number
          created_at?: string
          id?: string
          join_date?: string
          status?: string
          supervisor_id?: string | null
          target_completion_date?: string
          template_id?: string | null
          updated_at?: string
          user_id?: string
          vessel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "familiarization_records_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "familiarization_records_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "familiarization_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "familiarization_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "familiarization_records_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      familiarization_templates: {
        Row: {
          applicable_ranks: string[] | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          sections: Json
          template_name: string
          total_duration_days: number
          vessel_id: string
        }
        Insert: {
          applicable_ranks?: string[] | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          sections?: Json
          template_name: string
          total_duration_days?: number
          vessel_id: string
        }
        Update: {
          applicable_ranks?: string[] | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          sections?: Json
          template_name?: string
          total_duration_days?: number
          vessel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "familiarization_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "familiarization_templates_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      field_redactions: {
        Row: {
          company_id: string
          created_at: string | null
          field_name: string
          id: string
          module: string
          restricted_role_ids: string[] | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          field_name: string
          id?: string
          module: string
          restricted_role_ids?: string[] | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          field_name?: string
          id?: string
          module?: string
          restricted_role_ids?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_redactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_emergency_defaults: {
        Row: {
          company_id: string
          created_at: string | null
          emergency_heading: string
          id: string
          logo_url: string | null
          primary_email: string
          primary_instruction: string
          primary_phone: string
          secondary_instruction: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          emergency_heading?: string
          id?: string
          logo_url?: string | null
          primary_email: string
          primary_instruction?: string
          primary_phone: string
          secondary_instruction?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          emergency_heading?: string
          id?: string
          logo_url?: string | null
          primary_email?: string
          primary_instruction?: string
          primary_phone?: string
          secondary_instruction?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_emergency_defaults_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_emergency_team_defaults: {
        Row: {
          created_at: string | null
          display_order: number
          email: string
          fleet_default_id: string
          id: string
          name: string
          phone: string
          position: string
        }
        Insert: {
          created_at?: string | null
          display_order?: number
          email: string
          fleet_default_id: string
          id?: string
          name: string
          phone: string
          position: string
        }
        Update: {
          created_at?: string | null
          display_order?: number
          email?: string
          fleet_default_id?: string
          id?: string
          name?: string
          phone?: string
          position?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_emergency_team_defaults_fleet_default_id_fkey"
            columns: ["fleet_default_id"]
            isOneToOne: false
            referencedRelation: "fleet_emergency_defaults"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_groups: {
        Row: {
          color_hex: string | null
          company_id: string
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          color_hex?: string | null
          company_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          color_hex?: string | null
          company_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_groups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_bookings: {
        Row: {
          airline: string | null
          arrive_airport: string | null
          arrive_datetime_utc: string | null
          booked_at: string | null
          booked_by: string | null
          booking_reference: string | null
          confirmed_at: string | null
          cost_amount: number | null
          created_at: string | null
          currency: string | null
          depart_airport: string | null
          depart_datetime_utc: string | null
          flight_number: string | null
          flight_request_id: string
          id: string
          itinerary_file_url: string | null
          seat_number: string | null
          ticket_number: string | null
          travel_letter_file_url: string | null
        }
        Insert: {
          airline?: string | null
          arrive_airport?: string | null
          arrive_datetime_utc?: string | null
          booked_at?: string | null
          booked_by?: string | null
          booking_reference?: string | null
          confirmed_at?: string | null
          cost_amount?: number | null
          created_at?: string | null
          currency?: string | null
          depart_airport?: string | null
          depart_datetime_utc?: string | null
          flight_number?: string | null
          flight_request_id: string
          id?: string
          itinerary_file_url?: string | null
          seat_number?: string | null
          ticket_number?: string | null
          travel_letter_file_url?: string | null
        }
        Update: {
          airline?: string | null
          arrive_airport?: string | null
          arrive_datetime_utc?: string | null
          booked_at?: string | null
          booked_by?: string | null
          booking_reference?: string | null
          confirmed_at?: string | null
          cost_amount?: number | null
          created_at?: string | null
          currency?: string | null
          depart_airport?: string | null
          depart_datetime_utc?: string | null
          flight_number?: string | null
          flight_request_id?: string
          id?: string
          itinerary_file_url?: string | null
          seat_number?: string | null
          ticket_number?: string | null
          travel_letter_file_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flight_bookings_booked_by_fkey"
            columns: ["booked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "flight_bookings_flight_request_id_fkey"
            columns: ["flight_request_id"]
            isOneToOne: false
            referencedRelation: "flight_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          arrive_to: string
          assigned_agent_id: string | null
          baggage_notes: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          crew_id: string
          depart_from: string
          earliest_departure_date: string
          id: string
          latest_departure_date: string | null
          notes: string | null
          passport_nationality: string | null
          preferred_airline: string | null
          request_number: string
          request_type: string
          status: string | null
          updated_at: string | null
          vessel_id: string | null
          visa_requirements: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          arrive_to: string
          assigned_agent_id?: string | null
          baggage_notes?: string | null
          company_id: string
          created_at?: string | null
          created_by?: string | null
          crew_id: string
          depart_from: string
          earliest_departure_date: string
          id?: string
          latest_departure_date?: string | null
          notes?: string | null
          passport_nationality?: string | null
          preferred_airline?: string | null
          request_number: string
          request_type: string
          status?: string | null
          updated_at?: string | null
          vessel_id?: string | null
          visa_requirements?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          arrive_to?: string
          assigned_agent_id?: string | null
          baggage_notes?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          crew_id?: string
          depart_from?: string
          earliest_departure_date?: string
          id?: string
          latest_departure_date?: string | null
          notes?: string | null
          passport_nationality?: string | null
          preferred_airline?: string | null
          request_number?: string
          request_type?: string
          status?: string | null
          updated_at?: string | null
          vessel_id?: string | null
          visa_requirements?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flight_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "flight_requests_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "flight_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "flight_requests_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "flight_requests_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_segments: {
        Row: {
          airline_code: string | null
          airline_name: string | null
          arrival_airport_code: string
          arrival_airport_name: string | null
          arrival_city: string | null
          arrival_country: string | null
          arrival_datetime: string
          arrival_terminal: string | null
          booking_class: string | null
          created_at: string | null
          departure_airport_code: string
          departure_airport_name: string | null
          departure_city: string | null
          departure_country: string | null
          departure_datetime: string
          departure_terminal: string | null
          e_ticket_number: string | null
          extracted_from_document: string | null
          extraction_confidence: number | null
          flight_number: string | null
          id: string
          manually_verified: boolean | null
          pnr_locator: string | null
          seat_number: string | null
          segment_order: number
          status: string | null
          ticket_number: string | null
          travel_record_id: string
          updated_at: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          airline_code?: string | null
          airline_name?: string | null
          arrival_airport_code: string
          arrival_airport_name?: string | null
          arrival_city?: string | null
          arrival_country?: string | null
          arrival_datetime: string
          arrival_terminal?: string | null
          booking_class?: string | null
          created_at?: string | null
          departure_airport_code: string
          departure_airport_name?: string | null
          departure_city?: string | null
          departure_country?: string | null
          departure_datetime: string
          departure_terminal?: string | null
          e_ticket_number?: string | null
          extracted_from_document?: string | null
          extraction_confidence?: number | null
          flight_number?: string | null
          id?: string
          manually_verified?: boolean | null
          pnr_locator?: string | null
          seat_number?: string | null
          segment_order?: number
          status?: string | null
          ticket_number?: string | null
          travel_record_id: string
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          airline_code?: string | null
          airline_name?: string | null
          arrival_airport_code?: string
          arrival_airport_name?: string | null
          arrival_city?: string | null
          arrival_country?: string | null
          arrival_datetime?: string
          arrival_terminal?: string | null
          booking_class?: string | null
          created_at?: string | null
          departure_airport_code?: string
          departure_airport_name?: string | null
          departure_city?: string | null
          departure_country?: string | null
          departure_datetime?: string
          departure_terminal?: string | null
          e_ticket_number?: string | null
          extracted_from_document?: string | null
          extraction_confidence?: number | null
          flight_number?: string | null
          id?: string
          manually_verified?: boolean | null
          pnr_locator?: string | null
          seat_number?: string | null
          segment_order?: number
          status?: string | null
          ticket_number?: string | null
          travel_record_id?: string
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flight_segments_extracted_from_document_fkey"
            columns: ["extracted_from_document"]
            isOneToOne: false
            referencedRelation: "crew_travel_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_segments_travel_record_id_fkey"
            columns: ["travel_record_id"]
            isOneToOne: false
            referencedRelation: "crew_travel_records"
            referencedColumns: ["id"]
          },
        ]
      }
      form_ai_extraction_jobs: {
        Row: {
          company_id: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          error_message: string | null
          extracted_schema: Json | null
          extraction_confidence: number | null
          extraction_notes: string | null
          id: string
          source_file_url: string
          started_at: string | null
          status: string | null
          template_id: string | null
        }
        Insert: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          extracted_schema?: Json | null
          extraction_confidence?: number | null
          extraction_notes?: string | null
          id?: string
          source_file_url: string
          started_at?: string | null
          status?: string | null
          template_id?: string | null
        }
        Update: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          extracted_schema?: Json | null
          extraction_confidence?: number | null
          extraction_notes?: string | null
          id?: string
          source_file_url?: string
          started_at?: string | null
          status?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_ai_extraction_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_ai_extraction_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "form_ai_extraction_jobs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      form_amendments: {
        Row: {
          amendment_number: number
          amendment_reason: string
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          changed_fields: string[] | null
          id: string
          new_data: Json
          previous_data: Json
          re_signed_at: string | null
          requested_at: string | null
          requested_by: string
          requires_re_signature: boolean | null
          submission_id: string
        }
        Insert: {
          amendment_number: number
          amendment_reason: string
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          changed_fields?: string[] | null
          id?: string
          new_data: Json
          previous_data: Json
          re_signed_at?: string | null
          requested_at?: string | null
          requested_by: string
          requires_re_signature?: boolean | null
          submission_id: string
        }
        Update: {
          amendment_number?: number
          amendment_reason?: string
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          changed_fields?: string[] | null
          id?: string
          new_data?: Json
          previous_data?: Json
          re_signed_at?: string | null
          requested_at?: string | null
          requested_by?: string
          requires_re_signature?: boolean | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_amendments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "form_amendments_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "form_amendments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_attachments: {
        Row: {
          field_id: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
          submission_id: string | null
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          field_id?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          submission_id?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          field_id?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          submission_id?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_attachments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      form_categories: {
        Row: {
          company_id: string | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          parent_category_id: string | null
          sort_order: number | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          parent_category_id?: string | null
          sort_order?: number | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          parent_category_id?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "form_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_categories_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "form_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      form_offline_queue: {
        Row: {
          action_type: string
          created_at: string | null
          device_id: string
          entity_id: string | null
          entity_type: string
          id: string
          payload: Json
          sync_error: string | null
          sync_status: string | null
          synced_at: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string | null
          device_id: string
          entity_id?: string | null
          entity_type: string
          id?: string
          payload: Json
          sync_error?: string | null
          sync_status?: string | null
          synced_at?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string | null
          device_id?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          payload?: Json
          sync_error?: string | null
          sync_status?: string | null
          synced_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_offline_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      form_schedules: {
        Row: {
          assigned_role: string | null
          assigned_user_id: string | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          end_date: string | null
          id: string
          is_active: boolean | null
          last_generated_at: string | null
          next_due_date: string | null
          recurrence_config: Json
          recurrence_type: string
          schedule_name: string | null
          start_date: string
          template_id: string
          vessel_id: string | null
        }
        Insert: {
          assigned_role?: string | null
          assigned_user_id?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          last_generated_at?: string | null
          next_due_date?: string | null
          recurrence_config: Json
          recurrence_type: string
          schedule_name?: string | null
          start_date: string
          template_id: string
          vessel_id?: string | null
        }
        Update: {
          assigned_role?: string | null
          assigned_user_id?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          last_generated_at?: string | null
          next_due_date?: string | null
          recurrence_config?: Json
          recurrence_type?: string
          schedule_name?: string | null
          start_date?: string
          template_id?: string
          vessel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_schedules_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "form_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "form_schedules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_schedules_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      form_signatures: {
        Row: {
          created_at: string | null
          delegated_to: string | null
          device_info: string | null
          id: string
          ip_address: string | null
          rejection_reason: string | null
          signature_data: string | null
          signature_order: number
          signature_type: string | null
          signed_at: string | null
          signer_name: string
          signer_rank: string | null
          signer_role: string
          signer_user_id: string
          status: string | null
          submission_id: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string | null
          delegated_to?: string | null
          device_info?: string | null
          id?: string
          ip_address?: string | null
          rejection_reason?: string | null
          signature_data?: string | null
          signature_order: number
          signature_type?: string | null
          signed_at?: string | null
          signer_name: string
          signer_rank?: string | null
          signer_role: string
          signer_user_id: string
          status?: string | null
          submission_id: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string | null
          delegated_to?: string | null
          device_info?: string | null
          id?: string
          ip_address?: string | null
          rejection_reason?: string | null
          signature_data?: string | null
          signature_order?: number
          signature_type?: string | null
          signed_at?: string | null
          signer_name?: string
          signer_rank?: string | null
          signer_role?: string
          signer_user_id?: string
          status?: string | null
          submission_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_signatures_delegated_to_fkey"
            columns: ["delegated_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "form_signatures_signer_user_id_fkey"
            columns: ["signer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "form_signatures_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          amendment_of_id: string | null
          amendment_reason: string | null
          company_id: string | null
          content_hash: string | null
          created_at: string | null
          created_by: string | null
          created_date: string
          created_offline: boolean | null
          created_time_utc: string
          due_date: string | null
          form_data: Json
          id: string
          is_locked: boolean | null
          line_items: Json | null
          linked_audit_id: string | null
          linked_capa_id: string | null
          linked_incident_id: string | null
          linked_nc_id: string | null
          locked_at: string | null
          offline_device_id: string | null
          requires_amendment: boolean | null
          schedule_id: string | null
          status: string | null
          submission_number: string
          submitted_at: string | null
          submitted_by: string | null
          synced_at: string | null
          template_id: string
          template_version: number
          vessel_id: string | null
          vessel_local_offset_minutes: number | null
        }
        Insert: {
          amendment_of_id?: string | null
          amendment_reason?: string | null
          company_id?: string | null
          content_hash?: string | null
          created_at?: string | null
          created_by?: string | null
          created_date: string
          created_offline?: boolean | null
          created_time_utc: string
          due_date?: string | null
          form_data?: Json
          id?: string
          is_locked?: boolean | null
          line_items?: Json | null
          linked_audit_id?: string | null
          linked_capa_id?: string | null
          linked_incident_id?: string | null
          linked_nc_id?: string | null
          locked_at?: string | null
          offline_device_id?: string | null
          requires_amendment?: boolean | null
          schedule_id?: string | null
          status?: string | null
          submission_number: string
          submitted_at?: string | null
          submitted_by?: string | null
          synced_at?: string | null
          template_id: string
          template_version: number
          vessel_id?: string | null
          vessel_local_offset_minutes?: number | null
        }
        Update: {
          amendment_of_id?: string | null
          amendment_reason?: string | null
          company_id?: string | null
          content_hash?: string | null
          created_at?: string | null
          created_by?: string | null
          created_date?: string
          created_offline?: boolean | null
          created_time_utc?: string
          due_date?: string | null
          form_data?: Json
          id?: string
          is_locked?: boolean | null
          line_items?: Json | null
          linked_audit_id?: string | null
          linked_capa_id?: string | null
          linked_incident_id?: string | null
          linked_nc_id?: string | null
          locked_at?: string | null
          offline_device_id?: string | null
          requires_amendment?: boolean | null
          schedule_id?: string | null
          status?: string | null
          submission_number?: string
          submitted_at?: string | null
          submitted_by?: string | null
          synced_at?: string | null
          template_id?: string
          template_version?: number
          vessel_id?: string | null
          vessel_local_offset_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_amendment_of_id_fkey"
            columns: ["amendment_of_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "form_submissions_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "form_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "form_submissions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      form_template_acknowledgements: {
        Row: {
          acknowledged_at: string | null
          id: string
          template_id: string | null
          template_version: number
          user_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          id?: string
          template_id?: string | null
          template_version: number
          user_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          id?: string
          template_id?: string | null
          template_version?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_template_acknowledgements_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_template_acknowledgements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      form_template_versions: {
        Row: {
          created_at: string | null
          created_by: string | null
          form_schema: Json
          id: string
          template_id: string | null
          version: number
          version_notes: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          form_schema: Json
          id?: string
          template_id?: string | null
          version: number
          version_notes?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          form_schema?: Json
          id?: string
          template_id?: string | null
          version?: number
          version_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_template_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "form_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      form_templates: {
        Row: {
          allow_line_items: boolean | null
          allow_parallel_signing: boolean | null
          auto_attach_to_audit: boolean | null
          can_trigger_capa: boolean | null
          can_trigger_incident: boolean | null
          can_trigger_nc: boolean | null
          category_id: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          department_scope: string | null
          description: string | null
          effective_date: string | null
          expiry_action: string | null
          expiry_hours: number | null
          form_schema: Json
          form_type: string
          has_expiry: boolean | null
          id: string
          initiation_mode: string | null
          last_reviewed_at: string | null
          next_review_date: string | null
          published_at: string | null
          published_by: string | null
          required_signers: Json | null
          review_cycle_days: number | null
          source_file_name: string | null
          source_file_type: string | null
          source_file_url: string | null
          status: string | null
          supersedes_template_id: string | null
          template_code: string
          template_name: string
          updated_at: string | null
          version: number | null
          version_notes: string | null
          vessel_ids: string[] | null
          vessel_scope: string | null
        }
        Insert: {
          allow_line_items?: boolean | null
          allow_parallel_signing?: boolean | null
          auto_attach_to_audit?: boolean | null
          can_trigger_capa?: boolean | null
          can_trigger_incident?: boolean | null
          can_trigger_nc?: boolean | null
          category_id?: string | null
          company_id: string
          created_at?: string | null
          created_by?: string | null
          department_scope?: string | null
          description?: string | null
          effective_date?: string | null
          expiry_action?: string | null
          expiry_hours?: number | null
          form_schema?: Json
          form_type: string
          has_expiry?: boolean | null
          id?: string
          initiation_mode?: string | null
          last_reviewed_at?: string | null
          next_review_date?: string | null
          published_at?: string | null
          published_by?: string | null
          required_signers?: Json | null
          review_cycle_days?: number | null
          source_file_name?: string | null
          source_file_type?: string | null
          source_file_url?: string | null
          status?: string | null
          supersedes_template_id?: string | null
          template_code: string
          template_name: string
          updated_at?: string | null
          version?: number | null
          version_notes?: string | null
          vessel_ids?: string[] | null
          vessel_scope?: string | null
        }
        Update: {
          allow_line_items?: boolean | null
          allow_parallel_signing?: boolean | null
          auto_attach_to_audit?: boolean | null
          can_trigger_capa?: boolean | null
          can_trigger_incident?: boolean | null
          can_trigger_nc?: boolean | null
          category_id?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          department_scope?: string | null
          description?: string | null
          effective_date?: string | null
          expiry_action?: string | null
          expiry_hours?: number | null
          form_schema?: Json
          form_type?: string
          has_expiry?: boolean | null
          id?: string
          initiation_mode?: string | null
          last_reviewed_at?: string | null
          next_review_date?: string | null
          published_at?: string | null
          published_by?: string | null
          required_signers?: Json | null
          review_cycle_days?: number | null
          source_file_name?: string | null
          source_file_type?: string | null
          source_file_url?: string | null
          status?: string | null
          supersedes_template_id?: string | null
          template_code?: string
          template_name?: string
          updated_at?: string | null
          version?: number | null
          version_notes?: string | null
          vessel_ids?: string[] | null
          vessel_scope?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "form_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "form_templates_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "form_templates_supersedes_template_id_fkey"
            columns: ["supersedes_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      gdpr_requests: {
        Row: {
          company_id: string
          created_at: string | null
          deadline_date: string
          export_file_url: string | null
          id: string
          processed_at: string | null
          processed_by: string | null
          request_type: string
          requested_at: string | null
          requested_by: string
          response_notes: string | null
          status: string
          subject_user_id: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          deadline_date: string
          export_file_url?: string | null
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          request_type: string
          requested_at?: string | null
          requested_by: string
          response_notes?: string | null
          status?: string
          subject_user_id: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          deadline_date?: string
          export_file_url?: string | null
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          request_type?: string
          requested_at?: string | null
          requested_by?: string
          response_notes?: string | null
          status?: string
          subject_user_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gdpr_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gdpr_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "gdpr_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "gdpr_requests_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      hours_of_rest_records: {
        Row: {
          crew_id: string
          id: string
          is_compliant: boolean | null
          notes: string | null
          record_date: string
          rest_periods: Json
          signed_at: string | null
          signed_by_crew: boolean | null
          total_rest_hours: number | null
          total_work_hours: number | null
          verified_by: string | null
          vessel_id: string
          violations: Json | null
        }
        Insert: {
          crew_id: string
          id?: string
          is_compliant?: boolean | null
          notes?: string | null
          record_date: string
          rest_periods: Json
          signed_at?: string | null
          signed_by_crew?: boolean | null
          total_rest_hours?: number | null
          total_work_hours?: number | null
          verified_by?: string | null
          vessel_id: string
          violations?: Json | null
        }
        Update: {
          crew_id?: string
          id?: string
          is_compliant?: boolean | null
          notes?: string | null
          record_date?: string
          rest_periods?: Json
          signed_at?: string | null
          signed_by_crew?: boolean | null
          total_rest_hours?: number | null
          total_work_hours?: number | null
          verified_by?: string | null
          vessel_id?: string
          violations?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "hours_of_rest_records_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hours_of_rest_records_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hours_of_rest_records_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_audit_access_grants: {
        Row: {
          allowed_fields: string[] | null
          audit_session_id: string
          company_id: string
          denied_fields: string[] | null
          expires_at: string
          granted_access_level: string
          granted_at: string | null
          granted_by: string
          id: string
          notes: string | null
          revoked_at: string | null
          revoked_by: string | null
        }
        Insert: {
          allowed_fields?: string[] | null
          audit_session_id: string
          company_id: string
          denied_fields?: string[] | null
          expires_at: string
          granted_access_level?: string
          granted_at?: string | null
          granted_by: string
          id?: string
          notes?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Update: {
          allowed_fields?: string[] | null
          audit_session_id?: string
          company_id?: string
          denied_fields?: string[] | null
          expires_at?: string
          granted_access_level?: string
          granted_at?: string | null
          granted_by?: string
          id?: string
          notes?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_audit_access_grants_audit_session_id_fkey"
            columns: ["audit_session_id"]
            isOneToOne: false
            referencedRelation: "audit_mode_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_audit_access_grants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_audit_access_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hr_audit_access_grants_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      hr_record_metadata: {
        Row: {
          anonymized_at: string | null
          anonymized_by: string | null
          archived_at: string | null
          archived_by: string | null
          company_id: string
          created_at: string | null
          id: string
          last_accessed_at: string | null
          last_accessed_by: string | null
          lifecycle_status:
            | Database["public"]["Enums"]["record_lifecycle_status"]
            | null
          record_id: string
          record_type: Database["public"]["Enums"]["hr_record_type"]
          retention_end_date: string
          retention_start_date: string
          source_table: string
          updated_at: string | null
          user_id: string
          version: number | null
        }
        Insert: {
          anonymized_at?: string | null
          anonymized_by?: string | null
          archived_at?: string | null
          archived_by?: string | null
          company_id: string
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          last_accessed_by?: string | null
          lifecycle_status?:
            | Database["public"]["Enums"]["record_lifecycle_status"]
            | null
          record_id: string
          record_type: Database["public"]["Enums"]["hr_record_type"]
          retention_end_date: string
          retention_start_date: string
          source_table: string
          updated_at?: string | null
          user_id: string
          version?: number | null
        }
        Update: {
          anonymized_at?: string | null
          anonymized_by?: string | null
          archived_at?: string | null
          archived_by?: string | null
          company_id?: string
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          last_accessed_by?: string | null
          lifecycle_status?:
            | Database["public"]["Enums"]["record_lifecycle_status"]
            | null
          record_id?: string
          record_type?: Database["public"]["Enums"]["hr_record_type"]
          retention_end_date?: string
          retention_start_date?: string
          source_table?: string
          updated_at?: string | null
          user_id?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_record_metadata_anonymized_by_fkey"
            columns: ["anonymized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hr_record_metadata_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hr_record_metadata_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_record_metadata_last_accessed_by_fkey"
            columns: ["last_accessed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hr_record_metadata_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      incident_investigation: {
        Row: {
          approved_by: string | null
          approved_date: string | null
          completed_date: string | null
          contributing_factors: string[] | null
          created_at: string
          findings: string | null
          id: string
          incident_id: string
          investigation_method: string | null
          investigation_team: Json | null
          lead_investigator: string
          recommendations: string[] | null
          root_cause: string | null
          timeline: Json | null
        }
        Insert: {
          approved_by?: string | null
          approved_date?: string | null
          completed_date?: string | null
          contributing_factors?: string[] | null
          created_at?: string
          findings?: string | null
          id?: string
          incident_id: string
          investigation_method?: string | null
          investigation_team?: Json | null
          lead_investigator: string
          recommendations?: string[] | null
          root_cause?: string | null
          timeline?: Json | null
        }
        Update: {
          approved_by?: string | null
          approved_date?: string | null
          completed_date?: string | null
          contributing_factors?: string[] | null
          created_at?: string
          findings?: string | null
          id?: string
          incident_id?: string
          investigation_method?: string | null
          investigation_team?: Json | null
          lead_investigator?: string
          recommendations?: string[] | null
          root_cause?: string | null
          timeline?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_investigation_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "incident_investigation_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_investigation_lead_investigator_fkey"
            columns: ["lead_investigator"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      incidents: {
        Row: {
          attachments: Json | null
          cause_categories: string[] | null
          company_id: string
          contributing_factors: string[] | null
          created_at: string
          description: string
          dpa_notified: boolean | null
          dpa_notified_at: string | null
          dpa_notified_date: string | null
          id: string
          immediate_action: string | null
          immediate_cause: string | null
          incident_date: string
          incident_number: string
          incident_type: string
          injuries_reported: boolean | null
          investigation_required: boolean | null
          investigation_status: string | null
          involved_crew_ids: string[] | null
          location: string
          no_investigation_approved_at: string | null
          no_investigation_approved_by: string | null
          no_investigation_reason: string | null
          persons_involved: Json | null
          reported_by: string
          reported_date: string
          root_cause: string | null
          severity_actual: number
          severity_potential: number
          shipping_master_message: string | null
          shipping_master_notified: boolean | null
          status: string | null
          updated_at: string
          vessel_id: string
          witness_crew_ids: string[] | null
          witnesses: Json | null
        }
        Insert: {
          attachments?: Json | null
          cause_categories?: string[] | null
          company_id: string
          contributing_factors?: string[] | null
          created_at?: string
          description: string
          dpa_notified?: boolean | null
          dpa_notified_at?: string | null
          dpa_notified_date?: string | null
          id?: string
          immediate_action?: string | null
          immediate_cause?: string | null
          incident_date: string
          incident_number: string
          incident_type: string
          injuries_reported?: boolean | null
          investigation_required?: boolean | null
          investigation_status?: string | null
          involved_crew_ids?: string[] | null
          location: string
          no_investigation_approved_at?: string | null
          no_investigation_approved_by?: string | null
          no_investigation_reason?: string | null
          persons_involved?: Json | null
          reported_by: string
          reported_date?: string
          root_cause?: string | null
          severity_actual: number
          severity_potential: number
          shipping_master_message?: string | null
          shipping_master_notified?: boolean | null
          status?: string | null
          updated_at?: string
          vessel_id: string
          witness_crew_ids?: string[] | null
          witnesses?: Json | null
        }
        Update: {
          attachments?: Json | null
          cause_categories?: string[] | null
          company_id?: string
          contributing_factors?: string[] | null
          created_at?: string
          description?: string
          dpa_notified?: boolean | null
          dpa_notified_at?: string | null
          dpa_notified_date?: string | null
          id?: string
          immediate_action?: string | null
          immediate_cause?: string | null
          incident_date?: string
          incident_number?: string
          incident_type?: string
          injuries_reported?: boolean | null
          investigation_required?: boolean | null
          investigation_status?: string | null
          involved_crew_ids?: string[] | null
          location?: string
          no_investigation_approved_at?: string | null
          no_investigation_approved_by?: string | null
          no_investigation_reason?: string | null
          persons_involved?: Json | null
          reported_by?: string
          reported_date?: string
          root_cause?: string | null
          severity_actual?: number
          severity_potential?: number
          shipping_master_message?: string | null
          shipping_master_notified?: boolean | null
          status?: string | null
          updated_at?: string
          vessel_id?: string
          witness_crew_ids?: string[] | null
          witnesses?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "incidents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_no_investigation_approved_by_fkey"
            columns: ["no_investigation_approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "incidents_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "incidents_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_audit_sessions: {
        Row: {
          access_token: string | null
          access_token_expires_at: string | null
          audit_party: string
          auditor_email: string | null
          auditor_name: string | null
          company_id: string
          created_at: string | null
          created_by: string
          end_datetime: string
          id: string
          is_active: boolean | null
          start_datetime: string
          updated_at: string | null
          vessel_id: string | null
        }
        Insert: {
          access_token?: string | null
          access_token_expires_at?: string | null
          audit_party: string
          auditor_email?: string | null
          auditor_name?: string | null
          company_id: string
          created_at?: string | null
          created_by: string
          end_datetime: string
          id?: string
          is_active?: boolean | null
          start_datetime: string
          updated_at?: string | null
          vessel_id?: string | null
        }
        Update: {
          access_token?: string | null
          access_token_expires_at?: string | null
          audit_party?: string
          auditor_email?: string | null
          auditor_name?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string
          end_datetime?: string
          id?: string
          is_active?: boolean | null
          start_datetime?: string
          updated_at?: string | null
          vessel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insurance_audit_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_audit_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "insurance_audit_sessions_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_claims: {
        Row: {
          attachments: string[] | null
          claim_amount: number | null
          claim_date: string
          claim_number: string
          company_id: string
          correspondence_notes: string | null
          created_at: string | null
          created_by: string | null
          id: string
          incident_description: string
          lifecycle_status:
            | Database["public"]["Enums"]["record_lifecycle_status"]
            | null
          policy_id: string
          settlement_amount: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          attachments?: string[] | null
          claim_amount?: number | null
          claim_date: string
          claim_number: string
          company_id: string
          correspondence_notes?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          incident_description: string
          lifecycle_status?:
            | Database["public"]["Enums"]["record_lifecycle_status"]
            | null
          policy_id: string
          settlement_amount?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          attachments?: string[] | null
          claim_amount?: number | null
          claim_date?: string
          claim_number?: string
          company_id?: string
          correspondence_notes?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          incident_description?: string
          lifecycle_status?:
            | Database["public"]["Enums"]["record_lifecycle_status"]
            | null
          policy_id?: string
          settlement_amount?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insurance_claims_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_claims_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "insurance_claims_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "insurance_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_policies: {
        Row: {
          certificate_url: string | null
          company_id: string
          coverage_amount: number | null
          coverage_end_date: string
          coverage_start_date: string
          created_at: string | null
          created_by: string | null
          deductible_amount: number | null
          id: string
          insurer_contact: string | null
          insurer_name: string
          lifecycle_status:
            | Database["public"]["Enums"]["record_lifecycle_status"]
            | null
          notes: string | null
          policy_document_url: string | null
          policy_number: string
          policy_type: string
          premium_amount: number | null
          status: string | null
          updated_at: string | null
          updated_by: string | null
          vessel_id: string | null
        }
        Insert: {
          certificate_url?: string | null
          company_id: string
          coverage_amount?: number | null
          coverage_end_date: string
          coverage_start_date: string
          created_at?: string | null
          created_by?: string | null
          deductible_amount?: number | null
          id?: string
          insurer_contact?: string | null
          insurer_name: string
          lifecycle_status?:
            | Database["public"]["Enums"]["record_lifecycle_status"]
            | null
          notes?: string | null
          policy_document_url?: string | null
          policy_number: string
          policy_type: string
          premium_amount?: number | null
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vessel_id?: string | null
        }
        Update: {
          certificate_url?: string | null
          company_id?: string
          coverage_amount?: number | null
          coverage_end_date?: string
          coverage_start_date?: string
          created_at?: string | null
          created_by?: string | null
          deductible_amount?: number | null
          id?: string
          insurer_contact?: string | null
          insurer_name?: string
          lifecycle_status?:
            | Database["public"]["Enums"]["record_lifecycle_status"]
            | null
          notes?: string | null
          policy_document_url?: string | null
          policy_number?: string
          policy_type?: string
          premium_amount?: number | null
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vessel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insurance_policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_policies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "insurance_policies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "insurance_policies_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          crew_id: string
          end_date: string
          id: string
          leave_type: string
          reason: string | null
          rejection_reason: string | null
          start_date: string
          status: string | null
          travel_days_after: number | null
          travel_days_before: number | null
          vessel_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          crew_id: string
          end_date: string
          id?: string
          leave_type: string
          reason?: string | null
          rejection_reason?: string | null
          start_date: string
          status?: string | null
          travel_days_after?: number | null
          travel_days_before?: number | null
          vessel_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          crew_id?: string
          end_date?: string
          id?: string
          leave_type?: string
          reason?: string | null
          rejection_reason?: string | null
          start_date?: string
          status?: string | null
          travel_days_after?: number | null
          travel_days_before?: number | null
          vessel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leave_requests_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leave_requests_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      login_history: {
        Row: {
          created_at: string | null
          device_info: string | null
          id: string
          ip_address: string | null
          location: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_info?: string | null
          id?: string
          ip_address?: string | null
          location?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_info?: string | null
          id?: string
          ip_address?: string | null
          location?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      maintenance_task_templates: {
        Row: {
          category_id: string | null
          created_at: string
          equipment_id: string | null
          estimated_duration_minutes: number | null
          id: string
          interval_type: string
          interval_value: number
          is_active: boolean
          procedure_document_id: string | null
          required_spares: string[] | null
          required_tools: string[] | null
          responsible_role: string | null
          safety_precautions: string | null
          task_description: string | null
          task_name: string
          task_type: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          equipment_id?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          interval_type: string
          interval_value: number
          is_active?: boolean
          procedure_document_id?: string | null
          required_spares?: string[] | null
          required_tools?: string[] | null
          responsible_role?: string | null
          safety_precautions?: string | null
          task_description?: string | null
          task_name: string
          task_type: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          equipment_id?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          interval_type?: string
          interval_value?: number
          is_active?: boolean
          procedure_document_id?: string | null
          required_spares?: string[] | null
          required_tools?: string[] | null
          responsible_role?: string | null
          safety_precautions?: string | null
          task_description?: string | null
          task_name?: string
          task_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_task_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "equipment_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_task_templates_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_task_templates_procedure_document_id_fkey"
            columns: ["procedure_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_tasks: {
        Row: {
          actual_completion_date: string | null
          actual_start_date: string | null
          assigned_to_id: string | null
          attachments: string[] | null
          completed_by_id: string | null
          created_at: string
          due_date: string
          due_running_hours: number | null
          equipment_id: string
          findings: string | null
          hours_spent: number | null
          id: string
          next_due_date: string | null
          priority: string
          scheduled_date: string | null
          spares_used: Json | null
          status: string
          task_name: string
          task_number: string
          task_type: string
          template_id: string | null
          updated_at: string
          verified_by_id: string | null
          work_description: string | null
          work_performed: string | null
        }
        Insert: {
          actual_completion_date?: string | null
          actual_start_date?: string | null
          assigned_to_id?: string | null
          attachments?: string[] | null
          completed_by_id?: string | null
          created_at?: string
          due_date: string
          due_running_hours?: number | null
          equipment_id: string
          findings?: string | null
          hours_spent?: number | null
          id?: string
          next_due_date?: string | null
          priority?: string
          scheduled_date?: string | null
          spares_used?: Json | null
          status?: string
          task_name: string
          task_number: string
          task_type: string
          template_id?: string | null
          updated_at?: string
          verified_by_id?: string | null
          work_description?: string | null
          work_performed?: string | null
        }
        Update: {
          actual_completion_date?: string | null
          actual_start_date?: string | null
          assigned_to_id?: string | null
          attachments?: string[] | null
          completed_by_id?: string | null
          created_at?: string
          due_date?: string
          due_running_hours?: number | null
          equipment_id?: string
          findings?: string | null
          hours_spent?: number | null
          id?: string
          next_due_date?: string | null
          priority?: string
          scheduled_date?: string | null
          spares_used?: Json | null
          status?: string
          task_name?: string
          task_number?: string
          task_type?: string
          template_id?: string | null
          updated_at?: string
          verified_by_id?: string | null
          work_description?: string | null
          work_performed?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_tasks_assigned_to_id_fkey"
            columns: ["assigned_to_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "maintenance_tasks_completed_by_id_fkey"
            columns: ["completed_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "maintenance_tasks_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "maintenance_task_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tasks_verified_by_id_fkey"
            columns: ["verified_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      management_reviews: {
        Row: {
          action_items: Json | null
          agenda_items: Json | null
          attendees: Json | null
          audit_summary: Json | null
          capa_summary: Json | null
          company_id: string
          created_at: string
          id: string
          incident_summary: Json | null
          minutes_url: string | null
          next_review_date: string | null
          period_covered: string
          resource_decisions: string[] | null
          review_date: string
          sms_changes_needed: string[] | null
          status: string
          updated_at: string
        }
        Insert: {
          action_items?: Json | null
          agenda_items?: Json | null
          attendees?: Json | null
          audit_summary?: Json | null
          capa_summary?: Json | null
          company_id: string
          created_at?: string
          id?: string
          incident_summary?: Json | null
          minutes_url?: string | null
          next_review_date?: string | null
          period_covered: string
          resource_decisions?: string[] | null
          review_date: string
          sms_changes_needed?: string[] | null
          status?: string
          updated_at?: string
        }
        Update: {
          action_items?: Json | null
          agenda_items?: Json | null
          attendees?: Json | null
          audit_summary?: Json | null
          capa_summary?: Json | null
          company_id?: string
          created_at?: string
          id?: string
          incident_summary?: Json | null
          minutes_url?: string | null
          next_review_date?: string | null
          period_covered?: string
          resource_decisions?: string[] | null
          review_date?: string
          sms_changes_needed?: string[] | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "management_reviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_reports: {
        Row: {
          body_part_affected: string | null
          created_at: string | null
          created_by: string | null
          crew_id: string | null
          id: string
          incident_id: string | null
          injury_type: string | null
          is_anonymized_for_fleet: boolean | null
          medical_attention_required: boolean | null
          report_number: string
          time_off_work_days: number | null
          treatment_given: string | null
          vessel_id: string | null
        }
        Insert: {
          body_part_affected?: string | null
          created_at?: string | null
          created_by?: string | null
          crew_id?: string | null
          id?: string
          incident_id?: string | null
          injury_type?: string | null
          is_anonymized_for_fleet?: boolean | null
          medical_attention_required?: boolean | null
          report_number: string
          time_off_work_days?: number | null
          treatment_given?: string | null
          vessel_id?: string | null
        }
        Update: {
          body_part_affected?: string | null
          created_at?: string | null
          created_by?: string | null
          crew_id?: string | null
          id?: string
          incident_id?: string | null
          injury_type?: string | null
          is_anonymized_for_fleet?: boolean | null
          medical_attention_required?: boolean | null
          report_number?: string
          time_off_work_days?: number | null
          treatment_given?: string | null
          vessel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "medical_reports_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "medical_reports_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_reports_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          api_accessible: boolean | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          key: string
          name: string
          parent_key: string | null
          route: string | null
          sort_order: number | null
          supports_scoping: boolean | null
        }
        Insert: {
          api_accessible?: boolean | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          key: string
          name: string
          parent_key?: string | null
          route?: string | null
          sort_order?: number | null
          supports_scoping?: boolean | null
        }
        Update: {
          api_accessible?: boolean | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          key?: string
          name?: string
          parent_key?: string | null
          route?: string | null
          sort_order?: number | null
          supports_scoping?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "modules_parent_key_fkey"
            columns: ["parent_key"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["key"]
          },
        ]
      }
      notification_logs: {
        Row: {
          body_preview: string | null
          created_at: string | null
          delivered_at: string | null
          failed_at: string | null
          failure_reason: string | null
          id: string
          idempotency_key: string | null
          notification_type: string
          provider: string | null
          provider_message_id: string | null
          recipient_email: string | null
          recipient_user_id: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          sent_at: string | null
          status: string | null
          subject: string | null
          template_name: string | null
        }
        Insert: {
          body_preview?: string | null
          created_at?: string | null
          delivered_at?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          notification_type: string
          provider?: string | null
          provider_message_id?: string | null
          recipient_email?: string | null
          recipient_user_id?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          template_name?: string | null
        }
        Update: {
          body_preview?: string | null
          created_at?: string | null
          delivered_at?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          notification_type?: string
          provider?: string | null
          provider_message_id?: string | null
          recipient_email?: string | null
          recipient_user_id?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          template_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      permission_audit_log: {
        Row: {
          action_type: Database["public"]["Enums"]["audit_action_type"]
          actor_role: string
          actor_user_id: string
          after_state: Json | null
          before_state: Json | null
          id: string
          ip_address: unknown
          is_high_impact: boolean | null
          reason_text: string | null
          session_id: string | null
          target_module_key: string | null
          target_role_id: string | null
          target_user_id: string | null
          timestamp_utc: string | null
          user_agent: string | null
          vessel_scope: string | null
        }
        Insert: {
          action_type: Database["public"]["Enums"]["audit_action_type"]
          actor_role: string
          actor_user_id: string
          after_state?: Json | null
          before_state?: Json | null
          id?: string
          ip_address?: unknown
          is_high_impact?: boolean | null
          reason_text?: string | null
          session_id?: string | null
          target_module_key?: string | null
          target_role_id?: string | null
          target_user_id?: string | null
          timestamp_utc?: string | null
          user_agent?: string | null
          vessel_scope?: string | null
        }
        Update: {
          action_type?: Database["public"]["Enums"]["audit_action_type"]
          actor_role?: string
          actor_user_id?: string
          after_state?: Json | null
          before_state?: Json | null
          id?: string
          ip_address?: unknown
          is_high_impact?: boolean | null
          reason_text?: string | null
          session_id?: string | null
          target_module_key?: string | null
          target_role_id?: string | null
          target_user_id?: string | null
          timestamp_utc?: string | null
          user_agent?: string | null
          vessel_scope?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permission_audit_log_target_module_key_fkey"
            columns: ["target_module_key"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "permission_audit_log_target_role_id_fkey"
            columns: ["target_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_audit_log_vessel_scope_fkey"
            columns: ["vessel_scope"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          created_at: string | null
          description: string | null
          id: string
          module: string
        }
        Insert: {
          action: string
          created_at?: string | null
          description?: string | null
          id?: string
          module: string
        }
        Update: {
          action?: string
          created_at?: string | null
          description?: string | null
          id?: string
          module?: string
        }
        Relationships: []
      }
      permit_extensions: {
        Row: {
          approved_by_id: string | null
          created_at: string
          extended_by_id: string
          extension_reason: string
          id: string
          new_end_datetime: string
          permit_id: string
        }
        Insert: {
          approved_by_id?: string | null
          created_at?: string
          extended_by_id: string
          extension_reason: string
          id?: string
          new_end_datetime: string
          permit_id: string
        }
        Update: {
          approved_by_id?: string | null
          created_at?: string
          extended_by_id?: string
          extension_reason?: string
          id?: string
          new_end_datetime?: string
          permit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permit_extensions_approved_by_id_fkey"
            columns: ["approved_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "permit_extensions_extended_by_id_fkey"
            columns: ["extended_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "permit_extensions_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "work_permits"
            referencedColumns: ["id"]
          },
        ]
      }
      planner_periods: {
        Row: {
          created_at: string | null
          end_date: string
          id: string
          location: string | null
          notes: string | null
          period_type: string
          start_date: string
          status: string | null
          title: string | null
          vessel_id: string
        }
        Insert: {
          created_at?: string | null
          end_date: string
          id?: string
          location?: string | null
          notes?: string | null
          period_type: string
          start_date: string
          status?: string | null
          title?: string | null
          vessel_id: string
        }
        Update: {
          created_at?: string | null
          end_date?: string
          id?: string
          location?: string | null
          notes?: string | null
          period_type?: string
          start_date?: string
          status?: string | null
          title?: string | null
          vessel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planner_periods_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_departure_checklists: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          certificates_valid: boolean | null
          checklist_status: string | null
          company_id: string
          covid_test_date: string | null
          covid_test_document_id: string | null
          covid_test_required: boolean | null
          covid_test_result: string | null
          covid_test_type: string | null
          created_at: string | null
          crew_member_id: string
          emergency_contacts_confirmed: boolean | null
          flight_ticket_received: boolean | null
          id: string
          itinerary_sent: boolean | null
          joining_instructions_acknowledged: boolean | null
          joining_instructions_sent: boolean | null
          medical_certificate_id: string | null
          medical_fit_to_travel: boolean | null
          notes: string | null
          passport_expiry_ok: boolean | null
          passport_valid: boolean | null
          quarantine_days: number | null
          quarantine_location_id: string | null
          quarantine_required: boolean | null
          seamans_book_valid: boolean | null
          travel_insurance_valid: boolean | null
          travel_record_id: string
          updated_at: string | null
          vaccination_document_id: string | null
          vaccination_status: string | null
          visa_document_id: string | null
          visa_obtained: boolean | null
          visa_required: boolean | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          certificates_valid?: boolean | null
          checklist_status?: string | null
          company_id: string
          covid_test_date?: string | null
          covid_test_document_id?: string | null
          covid_test_required?: boolean | null
          covid_test_result?: string | null
          covid_test_type?: string | null
          created_at?: string | null
          crew_member_id: string
          emergency_contacts_confirmed?: boolean | null
          flight_ticket_received?: boolean | null
          id?: string
          itinerary_sent?: boolean | null
          joining_instructions_acknowledged?: boolean | null
          joining_instructions_sent?: boolean | null
          medical_certificate_id?: string | null
          medical_fit_to_travel?: boolean | null
          notes?: string | null
          passport_expiry_ok?: boolean | null
          passport_valid?: boolean | null
          quarantine_days?: number | null
          quarantine_location_id?: string | null
          quarantine_required?: boolean | null
          seamans_book_valid?: boolean | null
          travel_insurance_valid?: boolean | null
          travel_record_id: string
          updated_at?: string | null
          vaccination_document_id?: string | null
          vaccination_status?: string | null
          visa_document_id?: string | null
          visa_obtained?: boolean | null
          visa_required?: boolean | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          certificates_valid?: boolean | null
          checklist_status?: string | null
          company_id?: string
          covid_test_date?: string | null
          covid_test_document_id?: string | null
          covid_test_required?: boolean | null
          covid_test_result?: string | null
          covid_test_type?: string | null
          created_at?: string | null
          crew_member_id?: string
          emergency_contacts_confirmed?: boolean | null
          flight_ticket_received?: boolean | null
          id?: string
          itinerary_sent?: boolean | null
          joining_instructions_acknowledged?: boolean | null
          joining_instructions_sent?: boolean | null
          medical_certificate_id?: string | null
          medical_fit_to_travel?: boolean | null
          notes?: string | null
          passport_expiry_ok?: boolean | null
          passport_valid?: boolean | null
          quarantine_days?: number | null
          quarantine_location_id?: string | null
          quarantine_required?: boolean | null
          seamans_book_valid?: boolean | null
          travel_insurance_valid?: boolean | null
          travel_record_id?: string
          updated_at?: string | null
          vaccination_document_id?: string | null
          vaccination_status?: string | null
          visa_document_id?: string | null
          visa_obtained?: boolean | null
          visa_required?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "pre_departure_checklists_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_departure_checklists_covid_test_document_id_fkey"
            columns: ["covid_test_document_id"]
            isOneToOne: false
            referencedRelation: "crew_travel_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_departure_checklists_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "pre_departure_checklists_medical_certificate_id_fkey"
            columns: ["medical_certificate_id"]
            isOneToOne: false
            referencedRelation: "crew_travel_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_departure_checklists_quarantine_location_id_fkey"
            columns: ["quarantine_location_id"]
            isOneToOne: false
            referencedRelation: "quarantine_houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_departure_checklists_travel_record_id_fkey"
            columns: ["travel_record_id"]
            isOneToOne: false
            referencedRelation: "crew_travel_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_departure_checklists_vaccination_document_id_fkey"
            columns: ["vaccination_document_id"]
            isOneToOne: false
            referencedRelation: "crew_travel_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_departure_checklists_visa_document_id_fkey"
            columns: ["visa_document_id"]
            isOneToOne: false
            referencedRelation: "crew_travel_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: string | null
          avatar_url: string | null
          cabin: string | null
          company_id: string | null
          contract_end_date: string | null
          contract_start_date: string | null
          created_at: string
          date_of_birth: string | null
          department: string | null
          email: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          first_name: string
          gender: string | null
          id: string
          invitation_count: number | null
          invitation_token: string | null
          invitation_token_expires: string | null
          invited_at: string | null
          last_invited_at: string | null
          last_login_at: string | null
          last_name: string
          medical_expiry: string | null
          nationality: string | null
          notes: string | null
          passport_expiry: string | null
          passport_number: string | null
          phone: string | null
          position: string | null
          preferred_name: string | null
          rank: string | null
          role: Database["public"]["Enums"]["user_role"]
          rotation: string | null
          status: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
          version: number | null
          visa_status: string | null
        }
        Insert: {
          account_status?: string | null
          avatar_url?: string | null
          cabin?: string | null
          company_id?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          date_of_birth?: string | null
          department?: string | null
          email: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name: string
          gender?: string | null
          id?: string
          invitation_count?: number | null
          invitation_token?: string | null
          invitation_token_expires?: string | null
          invited_at?: string | null
          last_invited_at?: string | null
          last_login_at?: string | null
          last_name: string
          medical_expiry?: string | null
          nationality?: string | null
          notes?: string | null
          passport_expiry?: string | null
          passport_number?: string | null
          phone?: string | null
          position?: string | null
          preferred_name?: string | null
          rank?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          rotation?: string | null
          status?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
          version?: number | null
          visa_status?: string | null
        }
        Update: {
          account_status?: string | null
          avatar_url?: string | null
          cabin?: string | null
          company_id?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          date_of_birth?: string | null
          department?: string | null
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          invitation_count?: number | null
          invitation_token?: string | null
          invitation_token_expires?: string | null
          invited_at?: string | null
          last_invited_at?: string | null
          last_login_at?: string | null
          last_name?: string
          medical_expiry?: string | null
          nationality?: string | null
          notes?: string | null
          passport_expiry?: string | null
          passport_number?: string | null
          phone?: string | null
          position?: string | null
          preferred_name?: string | null
          rank?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          rotation?: string | null
          status?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          version?: number | null
          visa_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      quarantine_bookings: {
        Row: {
          actual_check_in: string | null
          actual_check_out: string | null
          check_in_date: string
          check_out_date: string
          company_id: string
          cost_currency: string | null
          created_at: string | null
          created_by: string | null
          crew_member_id: string
          dietary_requirements: string | null
          id: string
          notes: string | null
          paid: boolean | null
          quarantine_house_id: string
          room_number: string | null
          special_requests: string | null
          status: string | null
          total_cost: number | null
          total_nights: number | null
          travel_record_id: string | null
          updated_at: string | null
        }
        Insert: {
          actual_check_in?: string | null
          actual_check_out?: string | null
          check_in_date: string
          check_out_date: string
          company_id: string
          cost_currency?: string | null
          created_at?: string | null
          created_by?: string | null
          crew_member_id: string
          dietary_requirements?: string | null
          id?: string
          notes?: string | null
          paid?: boolean | null
          quarantine_house_id: string
          room_number?: string | null
          special_requests?: string | null
          status?: string | null
          total_cost?: number | null
          total_nights?: number | null
          travel_record_id?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_check_in?: string | null
          actual_check_out?: string | null
          check_in_date?: string
          check_out_date?: string
          company_id?: string
          cost_currency?: string | null
          created_at?: string | null
          created_by?: string | null
          crew_member_id?: string
          dietary_requirements?: string | null
          id?: string
          notes?: string | null
          paid?: boolean | null
          quarantine_house_id?: string
          room_number?: string | null
          special_requests?: string | null
          status?: string | null
          total_cost?: number | null
          total_nights?: number | null
          travel_record_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quarantine_bookings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quarantine_bookings_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "quarantine_bookings_quarantine_house_id_fkey"
            columns: ["quarantine_house_id"]
            isOneToOne: false
            referencedRelation: "quarantine_houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quarantine_bookings_travel_record_id_fkey"
            columns: ["travel_record_id"]
            isOneToOne: false
            referencedRelation: "crew_travel_records"
            referencedColumns: ["id"]
          },
        ]
      }
      quarantine_houses: {
        Row: {
          address_line1: string
          address_line2: string | null
          airport_transfer_available: boolean | null
          check_in_instructions: string | null
          city: string
          company_id: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          country: string
          created_at: string | null
          created_by: string | null
          daily_rate: number | null
          house_rules: string | null
          id: string
          includes_meals: boolean | null
          is_active: boolean | null
          kitchen_available: boolean | null
          latitude: number | null
          laundry_available: boolean | null
          longitude: number | null
          name: string
          notes: string | null
          parking_available: boolean | null
          photos: Json | null
          postal_code: string | null
          rate_currency: string | null
          state_province: string | null
          total_beds: number
          total_rooms: number
          updated_at: string | null
          wifi_available: boolean | null
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          airport_transfer_available?: boolean | null
          check_in_instructions?: string | null
          city: string
          company_id: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country: string
          created_at?: string | null
          created_by?: string | null
          daily_rate?: number | null
          house_rules?: string | null
          id?: string
          includes_meals?: boolean | null
          is_active?: boolean | null
          kitchen_available?: boolean | null
          latitude?: number | null
          laundry_available?: boolean | null
          longitude?: number | null
          name: string
          notes?: string | null
          parking_available?: boolean | null
          photos?: Json | null
          postal_code?: string | null
          rate_currency?: string | null
          state_province?: string | null
          total_beds?: number
          total_rooms?: number
          updated_at?: string | null
          wifi_available?: boolean | null
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          airport_transfer_available?: boolean | null
          check_in_instructions?: string | null
          city?: string
          company_id?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string
          created_at?: string | null
          created_by?: string | null
          daily_rate?: number | null
          house_rules?: string | null
          id?: string
          includes_meals?: boolean | null
          is_active?: boolean | null
          kitchen_available?: boolean | null
          latitude?: number | null
          laundry_available?: boolean | null
          longitude?: number | null
          name?: string
          notes?: string | null
          parking_available?: boolean | null
          photos?: Json | null
          postal_code?: string | null
          rate_currency?: string | null
          state_province?: string | null
          total_beds?: number
          total_rooms?: number
          updated_at?: string | null
          wifi_available?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "quarantine_houses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rbac_user_roles: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          department: string | null
          id: string
          is_active: boolean | null
          role_id: string
          user_id: string
          valid_from: string | null
          valid_until: string | null
          vessel_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          department?: string | null
          id?: string
          is_active?: boolean | null
          role_id: string
          user_id: string
          valid_from?: string | null
          valid_until?: string | null
          vessel_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          department?: string | null
          id?: string
          is_active?: boolean | null
          role_id?: string
          user_id?: string
          valid_from?: string | null
          valid_until?: string | null
          vessel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rbac_user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rbac_user_roles_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_assessment_hazards: {
        Row: {
          consequences: string
          controls: string[]
          created_at: string
          hazard_description: string
          id: string
          likelihood_after: number | null
          likelihood_before: number
          responsible_person: string | null
          risk_assessment_id: string
          risk_score_after: number | null
          risk_score_before: number
          sequence_order: number
          severity_after: number | null
          severity_before: number
        }
        Insert: {
          consequences: string
          controls?: string[]
          created_at?: string
          hazard_description: string
          id?: string
          likelihood_after?: number | null
          likelihood_before: number
          responsible_person?: string | null
          risk_assessment_id: string
          risk_score_after?: number | null
          risk_score_before: number
          sequence_order?: number
          severity_after?: number | null
          severity_before: number
        }
        Update: {
          consequences?: string
          controls?: string[]
          created_at?: string
          hazard_description?: string
          id?: string
          likelihood_after?: number | null
          likelihood_before?: number
          responsible_person?: string | null
          risk_assessment_id?: string
          risk_score_after?: number | null
          risk_score_before?: number
          sequence_order?: number
          severity_after?: number | null
          severity_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "risk_assessment_hazards_risk_assessment_id_fkey"
            columns: ["risk_assessment_id"]
            isOneToOne: false
            referencedRelation: "risk_assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_assessment_templates: {
        Row: {
          common_hazards: Json
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          task_category: string
          template_name: string
          vessel_id: string | null
        }
        Insert: {
          common_hazards?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          task_category: string
          template_name: string
          vessel_id?: string | null
        }
        Update: {
          common_hazards?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          task_category?: string
          template_name?: string
          vessel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "risk_assessment_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "risk_assessment_templates_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_assessments: {
        Row: {
          approved_by_id: string | null
          assessed_by_id: string
          assessment_date: string
          assessment_number: string
          created_at: string
          id: string
          linked_procedure_id: string | null
          review_date: string
          risk_score_initial: number | null
          risk_score_residual: number | null
          status: string
          task_date: string
          task_description: string | null
          task_location: string
          task_name: string
          template_id: string | null
          updated_at: string
          vessel_id: string
        }
        Insert: {
          approved_by_id?: string | null
          assessed_by_id: string
          assessment_date?: string
          assessment_number: string
          created_at?: string
          id?: string
          linked_procedure_id?: string | null
          review_date: string
          risk_score_initial?: number | null
          risk_score_residual?: number | null
          status?: string
          task_date: string
          task_description?: string | null
          task_location: string
          task_name: string
          template_id?: string | null
          updated_at?: string
          vessel_id: string
        }
        Update: {
          approved_by_id?: string | null
          assessed_by_id?: string
          assessment_date?: string
          assessment_number?: string
          created_at?: string
          id?: string
          linked_procedure_id?: string | null
          review_date?: string
          risk_score_initial?: number | null
          risk_score_residual?: number | null
          status?: string
          task_date?: string
          task_description?: string | null
          task_location?: string
          task_name?: string
          template_id?: string | null
          updated_at?: string
          vessel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_assessments_approved_by_id_fkey"
            columns: ["approved_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "risk_assessments_assessed_by_id_fkey"
            columns: ["assessed_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "risk_assessments_linked_procedure_id_fkey"
            columns: ["linked_procedure_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_assessments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "risk_assessment_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_assessments_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string | null
          id: string
          module_key: string
          permission: Database["public"]["Enums"]["permission_level"]
          restrictions: Json | null
          role_id: string
          scope: Database["public"]["Enums"]["role_scope_type"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          module_key: string
          permission: Database["public"]["Enums"]["permission_level"]
          restrictions?: Json | null
          role_id: string
          scope?: Database["public"]["Enums"]["role_scope_type"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          module_key?: string
          permission?: Database["public"]["Enums"]["permission_level"]
          restrictions?: Json | null
          role_id?: string
          scope?: Database["public"]["Enums"]["role_scope_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey1"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions_legacy_v1: {
        Row: {
          created_at: string | null
          department_scope: boolean | null
          id: string
          permission_id: string
          role_id: string
          self_only: boolean | null
          vessel_scope: boolean | null
        }
        Insert: {
          created_at?: string | null
          department_scope?: boolean | null
          id?: string
          permission_id: string
          role_id: string
          self_only?: boolean | null
          vessel_scope?: boolean | null
        }
        Update: {
          created_at?: string | null
          department_scope?: boolean | null
          id?: string
          permission_id?: string
          role_id?: string
          self_only?: boolean | null
          vessel_scope?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles_legacy_v1"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string | null
          default_scope: Database["public"]["Enums"]["role_scope_type"] | null
          description: string | null
          display_name: string
          id: string
          is_api_only: boolean | null
          is_system_role: boolean | null
          is_time_limited: boolean | null
          max_session_hours: number | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_scope?: Database["public"]["Enums"]["role_scope_type"] | null
          description?: string | null
          display_name: string
          id?: string
          is_api_only?: boolean | null
          is_system_role?: boolean | null
          is_time_limited?: boolean | null
          max_session_hours?: number | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_scope?: Database["public"]["Enums"]["role_scope_type"] | null
          description?: string | null
          display_name?: string
          id?: string
          is_api_only?: boolean | null
          is_system_role?: boolean | null
          is_time_limited?: boolean | null
          max_session_hours?: number | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      roles_legacy_v1: {
        Row: {
          company_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_custom: boolean | null
          is_system_role: boolean | null
          role_code: string
          role_name: string
          scope_type: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_custom?: boolean | null
          is_system_role?: boolean | null
          role_code: string
          role_name: string
          scope_type?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_custom?: boolean | null
          is_system_role?: boolean | null
          role_code?: string
          role_name?: string
          scope_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      running_hours_log: {
        Row: {
          created_at: string
          equipment_id: string
          id: string
          notes: string | null
          recorded_by_id: string
          recorded_date: string
          running_hours: number
        }
        Insert: {
          created_at?: string
          equipment_id: string
          id?: string
          notes?: string | null
          recorded_by_id: string
          recorded_date?: string
          running_hours: number
        }
        Update: {
          created_at?: string
          equipment_id?: string
          id?: string
          notes?: string | null
          recorded_by_id?: string
          recorded_date?: string
          running_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "running_hours_log_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "running_hours_log_recorded_by_id_fkey"
            columns: ["recorded_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      sms_amendments: {
        Row: {
          amended_at: string | null
          amended_by: string
          amendment_number: number
          amendment_reason: string
          changed_fields: string[] | null
          id: string
          new_data: Json
          previous_data: Json
          re_signed_at: string | null
          requires_re_signature: boolean | null
          submission_id: string
        }
        Insert: {
          amended_at?: string | null
          amended_by: string
          amendment_number: number
          amendment_reason: string
          changed_fields?: string[] | null
          id?: string
          new_data: Json
          previous_data: Json
          re_signed_at?: string | null
          requires_re_signature?: boolean | null
          submission_id: string
        }
        Update: {
          amended_at?: string | null
          amended_by?: string
          amendment_number?: number
          amendment_reason?: string
          changed_fields?: string[] | null
          id?: string
          new_data?: Json
          previous_data?: Json
          re_signed_at?: string | null
          requires_re_signature?: boolean | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_amendments_amended_by_fkey"
            columns: ["amended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sms_amendments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "sms_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_attachments: {
        Row: {
          description: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
          submission_id: string
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          description?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          submission_id: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          description?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          submission_id?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_attachments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "sms_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      sms_signatures: {
        Row: {
          action: string | null
          created_at: string | null
          delegated_to: string | null
          device_info: string | null
          id: string
          ip_address: string | null
          rejection_reason: string | null
          signature_data: string | null
          signature_method: string | null
          signature_order: number
          signed_at: string
          signer_name: string
          signer_rank: string | null
          signer_role: string
          signer_user_id: string
          submission_id: string
          user_agent: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          delegated_to?: string | null
          device_info?: string | null
          id?: string
          ip_address?: string | null
          rejection_reason?: string | null
          signature_data?: string | null
          signature_method?: string | null
          signature_order: number
          signed_at?: string
          signer_name: string
          signer_rank?: string | null
          signer_role: string
          signer_user_id: string
          submission_id: string
          user_agent?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          delegated_to?: string | null
          device_info?: string | null
          id?: string
          ip_address?: string | null
          rejection_reason?: string | null
          signature_data?: string | null
          signature_method?: string | null
          signature_order?: number
          signed_at?: string
          signer_name?: string
          signer_rank?: string | null
          signer_role?: string
          signer_user_id?: string
          submission_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_signatures_delegated_to_fkey"
            columns: ["delegated_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sms_signatures_signer_user_id_fkey"
            columns: ["signer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sms_signatures_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "sms_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_submissions: {
        Row: {
          company_id: string
          content_hash: string | null
          created_at: string | null
          created_by: string | null
          form_data: Json
          id: string
          is_locked: boolean | null
          locked_at: string | null
          status: string | null
          submission_date: string
          submission_number: string
          submission_time_utc: string
          submitted_at: string | null
          submitted_by: string | null
          template_id: string
          template_version: number
          updated_at: string | null
          vessel_id: string | null
          vessel_local_offset_minutes: number | null
        }
        Insert: {
          company_id: string
          content_hash?: string | null
          created_at?: string | null
          created_by?: string | null
          form_data?: Json
          id?: string
          is_locked?: boolean | null
          locked_at?: string | null
          status?: string | null
          submission_date: string
          submission_number: string
          submission_time_utc?: string
          submitted_at?: string | null
          submitted_by?: string | null
          template_id: string
          template_version: number
          updated_at?: string | null
          vessel_id?: string | null
          vessel_local_offset_minutes?: number | null
        }
        Update: {
          company_id?: string
          content_hash?: string | null
          created_at?: string | null
          created_by?: string | null
          form_data?: Json
          id?: string
          is_locked?: boolean | null
          locked_at?: string | null
          status?: string | null
          submission_date?: string
          submission_number?: string
          submission_time_utc?: string
          submitted_at?: string | null
          submitted_by?: string | null
          template_id?: string
          template_version?: number
          updated_at?: string | null
          vessel_id?: string | null
          vessel_local_offset_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_submissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_submissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sms_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sms_submissions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "sms_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_submissions_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_templates: {
        Row: {
          allows_attachments: boolean | null
          category: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          effective_date: string
          form_schema: Json
          id: string
          instructions: string | null
          max_attachments: number | null
          owner_role: string | null
          published_at: string | null
          published_by: string | null
          recurrence_config: Json | null
          recurrence_type: string | null
          required_signers: Json
          status: string | null
          supersedes_template_id: string | null
          template_code: string
          template_name: string
          template_type: string
          updated_at: string | null
          version: number | null
        }
        Insert: {
          allows_attachments?: boolean | null
          category?: string | null
          company_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          effective_date: string
          form_schema?: Json
          id?: string
          instructions?: string | null
          max_attachments?: number | null
          owner_role?: string | null
          published_at?: string | null
          published_by?: string | null
          recurrence_config?: Json | null
          recurrence_type?: string | null
          required_signers?: Json
          status?: string | null
          supersedes_template_id?: string | null
          template_code: string
          template_name: string
          template_type: string
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          allows_attachments?: boolean | null
          category?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          effective_date?: string
          form_schema?: Json
          id?: string
          instructions?: string | null
          max_attachments?: number | null
          owner_role?: string | null
          published_at?: string | null
          published_by?: string | null
          recurrence_config?: Json | null
          recurrence_type?: string | null
          required_signers?: Json
          status?: string | null
          supersedes_template_id?: string | null
          template_code?: string
          template_name?: string
          template_type?: string
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sms_templates_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sms_templates_supersedes_template_id_fkey"
            columns: ["supersedes_template_id"]
            isOneToOne: false
            referencedRelation: "sms_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      spare_parts: {
        Row: {
          created_at: string
          equipment_ids: string[] | null
          id: string
          last_ordered_date: string | null
          location_onboard: string | null
          manufacturer: string | null
          minimum_stock: number
          notes: string | null
          part_name: string
          part_number: string
          quantity_onboard: number
          supplier: string | null
          unit_cost: number | null
          updated_at: string
          vessel_id: string
        }
        Insert: {
          created_at?: string
          equipment_ids?: string[] | null
          id?: string
          last_ordered_date?: string | null
          location_onboard?: string | null
          manufacturer?: string | null
          minimum_stock?: number
          notes?: string | null
          part_name: string
          part_number: string
          quantity_onboard?: number
          supplier?: string | null
          unit_cost?: number | null
          updated_at?: string
          vessel_id: string
        }
        Update: {
          created_at?: string
          equipment_ids?: string[] | null
          id?: string
          last_ordered_date?: string | null
          location_onboard?: string | null
          manufacturer?: string | null
          minimum_stock?: number
          notes?: string | null
          part_name?: string
          part_number?: string
          quantity_onboard?: number
          supplier?: string | null
          unit_cost?: number | null
          updated_at?: string
          vessel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spare_parts_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      training_courses: {
        Row: {
          applicable_ranks: string[] | null
          course_category: string
          course_code: string
          course_duration_days: number | null
          course_name: string
          created_at: string
          description: string | null
          id: string
          is_mandatory: boolean
          issuing_authority: string | null
          validity_period_months: number | null
        }
        Insert: {
          applicable_ranks?: string[] | null
          course_category: string
          course_code: string
          course_duration_days?: number | null
          course_name: string
          created_at?: string
          description?: string | null
          id?: string
          is_mandatory?: boolean
          issuing_authority?: string | null
          validity_period_months?: number | null
        }
        Update: {
          applicable_ranks?: string[] | null
          course_category?: string
          course_code?: string
          course_duration_days?: number | null
          course_name?: string
          created_at?: string
          description?: string | null
          id?: string
          is_mandatory?: boolean
          issuing_authority?: string | null
          validity_period_months?: number | null
        }
        Relationships: []
      }
      training_matrix: {
        Row: {
          created_at: string
          id: string
          rank: string
          required_courses: Json
          vessel_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          rank: string
          required_courses?: Json
          vessel_id: string
        }
        Update: {
          created_at?: string
          id?: string
          rank?: string
          required_courses?: Json
          vessel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_matrix_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      training_records: {
        Row: {
          alert_sent: boolean
          certificate_file_url: string | null
          certificate_number: string | null
          completion_date: string
          course_id: string
          created_at: string
          expiry_date: string | null
          grade_result: string | null
          id: string
          issue_date: string
          notes: string | null
          status: string
          training_provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_sent?: boolean
          certificate_file_url?: string | null
          certificate_number?: string | null
          completion_date: string
          course_id: string
          created_at?: string
          expiry_date?: string | null
          grade_result?: string | null
          id?: string
          issue_date: string
          notes?: string | null
          status?: string
          training_provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_sent?: boolean
          certificate_file_url?: string | null
          certificate_number?: string | null
          completion_date?: string
          course_id?: string
          created_at?: string
          expiry_date?: string | null
          grade_result?: string | null
          id?: string
          issue_date?: string
          notes?: string | null
          status?: string
          training_provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_records_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_permission_overrides: {
        Row: {
          created_at: string | null
          created_by: string
          id: string
          is_granted: boolean
          module_key: string
          permission: Database["public"]["Enums"]["permission_level"]
          reason: string
          restrictions: Json | null
          scope: Database["public"]["Enums"]["role_scope_type"] | null
          user_id: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          id?: string
          is_granted: boolean
          module_key: string
          permission: Database["public"]["Enums"]["permission_level"]
          reason: string
          restrictions?: Json | null
          scope?: Database["public"]["Enums"]["role_scope_type"] | null
          user_id: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          id?: string
          is_granted?: boolean
          module_key?: string
          permission?: Database["public"]["Enums"]["permission_level"]
          reason?: string
          restrictions?: Json | null
          scope?: Database["public"]["Enums"]["role_scope_type"] | null
          user_id?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_overrides_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["key"]
          },
        ]
      }
      user_preferences: {
        Row: {
          alert_severities: Json | null
          created_at: string
          daily_digest_time: string | null
          dashboard_widgets: string[] | null
          default_snooze_minutes: number | null
          default_vessel_id: string | null
          id: string
          module_subscriptions: Json | null
          notification_channels: Json | null
          sidebar_collapsed: boolean | null
          theme: string | null
          updated_at: string
          user_id: string
          weekly_digest_day: string | null
          weekly_digest_time: string | null
        }
        Insert: {
          alert_severities?: Json | null
          created_at?: string
          daily_digest_time?: string | null
          dashboard_widgets?: string[] | null
          default_snooze_minutes?: number | null
          default_vessel_id?: string | null
          id?: string
          module_subscriptions?: Json | null
          notification_channels?: Json | null
          sidebar_collapsed?: boolean | null
          theme?: string | null
          updated_at?: string
          user_id: string
          weekly_digest_day?: string | null
          weekly_digest_time?: string | null
        }
        Update: {
          alert_severities?: Json | null
          created_at?: string
          daily_digest_time?: string | null
          dashboard_widgets?: string[] | null
          default_snooze_minutes?: number | null
          default_vessel_id?: string | null
          id?: string
          module_subscriptions?: Json | null
          notification_channels?: Json | null
          sidebar_collapsed?: boolean | null
          theme?: string | null
          updated_at?: string
          user_id?: string
          weekly_digest_day?: string | null
          weekly_digest_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_default_vessel_id_fkey"
            columns: ["default_vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string | null
          created_at: string | null
          department: string | null
          expires_at: string | null
          granted_at: string | null
          granted_by: string | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string | null
          user_id: string
          vessel_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          department?: string | null
          expires_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
          user_id: string
          vessel_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          department?: string | null
          expires_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
          user_id?: string
          vessel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          browser: string | null
          created_at: string | null
          device_info: string | null
          id: string
          ip_address: string | null
          is_current: boolean | null
          last_active_at: string | null
          location: string | null
          revoked_at: string | null
          session_token: string | null
          user_id: string
        }
        Insert: {
          browser?: string | null
          created_at?: string | null
          device_info?: string | null
          id?: string
          ip_address?: string | null
          is_current?: boolean | null
          last_active_at?: string | null
          location?: string | null
          revoked_at?: string | null
          session_token?: string | null
          user_id: string
        }
        Update: {
          browser?: string | null
          created_at?: string | null
          device_info?: string | null
          id?: string
          ip_address?: string | null
          is_current?: boolean | null
          last_active_at?: string | null
          location?: string | null
          revoked_at?: string | null
          session_token?: string | null
          user_id?: string
        }
        Relationships: []
      }
      vessel_emergency_contacts: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          emergency_heading: string
          id: string
          is_active: boolean | null
          logo_url: string | null
          notes: string | null
          primary_email: string
          primary_instruction: string
          primary_phone: string
          revision_date: string
          revision_number: number
          secondary_instruction: string | null
          updated_at: string | null
          updated_by: string | null
          vessel_id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          created_by?: string | null
          emergency_heading?: string
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          notes?: string | null
          primary_email: string
          primary_instruction?: string
          primary_phone: string
          revision_date?: string
          revision_number?: number
          secondary_instruction?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vessel_id: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          emergency_heading?: string
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          notes?: string | null
          primary_email?: string
          primary_instruction?: string
          primary_phone?: string
          revision_date?: string
          revision_number?: number
          secondary_instruction?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vessel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vessel_emergency_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vessel_emergency_contacts_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      vessels: {
        Row: {
          beam: number | null
          build_year: number | null
          builder: string | null
          call_sign: string | null
          class_emergency_contact: string | null
          classification_society: string | null
          company_id: string
          created_at: string
          draft: number | null
          emergency_primary_contact_name: string | null
          emergency_primary_email: string | null
          emergency_primary_phone: string | null
          emergency_secondary_contact_name: string | null
          emergency_secondary_email: string | null
          emergency_secondary_phone: string | null
          flag_state: string | null
          flag_state_emergency_contact: string | null
          fleet_group_id: string | null
          gross_tonnage: number | null
          home_port: string | null
          id: string
          imo_number: string | null
          length_overall: number | null
          medical_support_contact: string | null
          minimum_safe_manning: Json | null
          mmsi: string | null
          mrcc_contact_info: string | null
          name: string
          nearest_port_agent_contact: string | null
          operational_status: string | null
          security_support_contact: string | null
          status: string | null
          updated_at: string
          updated_by: string | null
          vessel_type: string | null
        }
        Insert: {
          beam?: number | null
          build_year?: number | null
          builder?: string | null
          call_sign?: string | null
          class_emergency_contact?: string | null
          classification_society?: string | null
          company_id: string
          created_at?: string
          draft?: number | null
          emergency_primary_contact_name?: string | null
          emergency_primary_email?: string | null
          emergency_primary_phone?: string | null
          emergency_secondary_contact_name?: string | null
          emergency_secondary_email?: string | null
          emergency_secondary_phone?: string | null
          flag_state?: string | null
          flag_state_emergency_contact?: string | null
          fleet_group_id?: string | null
          gross_tonnage?: number | null
          home_port?: string | null
          id?: string
          imo_number?: string | null
          length_overall?: number | null
          medical_support_contact?: string | null
          minimum_safe_manning?: Json | null
          mmsi?: string | null
          mrcc_contact_info?: string | null
          name: string
          nearest_port_agent_contact?: string | null
          operational_status?: string | null
          security_support_contact?: string | null
          status?: string | null
          updated_at?: string
          updated_by?: string | null
          vessel_type?: string | null
        }
        Update: {
          beam?: number | null
          build_year?: number | null
          builder?: string | null
          call_sign?: string | null
          class_emergency_contact?: string | null
          classification_society?: string | null
          company_id?: string
          created_at?: string
          draft?: number | null
          emergency_primary_contact_name?: string | null
          emergency_primary_email?: string | null
          emergency_primary_phone?: string | null
          emergency_secondary_contact_name?: string | null
          emergency_secondary_email?: string | null
          emergency_secondary_phone?: string | null
          flag_state?: string | null
          flag_state_emergency_contact?: string | null
          fleet_group_id?: string | null
          gross_tonnage?: number | null
          home_port?: string | null
          id?: string
          imo_number?: string | null
          length_overall?: number | null
          medical_support_contact?: string | null
          minimum_safe_manning?: Json | null
          mmsi?: string | null
          mrcc_contact_info?: string | null
          name?: string
          nearest_port_agent_contact?: string | null
          operational_status?: string | null
          security_support_contact?: string | null
          status?: string | null
          updated_at?: string
          updated_by?: string | null
          vessel_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vessels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vessels_fleet_group_id_fkey"
            columns: ["fleet_group_id"]
            isOneToOne: false
            referencedRelation: "fleet_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vessels_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      webhook_configurations: {
        Row: {
          allowed_data_types: string[]
          allowed_ip_addresses: string[] | null
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
          name: string
          rate_limit_per_minute: number | null
          updated_at: string
          webhook_secret: string
        }
        Insert: {
          allowed_data_types?: string[]
          allowed_ip_addresses?: string[] | null
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          name: string
          rate_limit_per_minute?: number | null
          updated_at?: string
          webhook_secret: string
        }
        Update: {
          allowed_data_types?: string[]
          allowed_ip_addresses?: string[] | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          name?: string
          rate_limit_per_minute?: number | null
          updated_at?: string
          webhook_secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_configurations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          company_id: string
          created_at: string
          data_type: string
          error_message: string | null
          event_type: string
          id: string
          ip_address: string | null
          payload: Json
          processing_completed_at: string | null
          processing_started_at: string | null
          records_created: number | null
          records_failed: number | null
          records_updated: number | null
          status: string
          user_agent: string | null
          webhook_config_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          data_type: string
          error_message?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          payload: Json
          processing_completed_at?: string | null
          processing_started_at?: string | null
          records_created?: number | null
          records_failed?: number | null
          records_updated?: number | null
          status?: string
          user_agent?: string | null
          webhook_config_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          data_type?: string
          error_message?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          payload?: Json
          processing_completed_at?: string | null
          processing_started_at?: string | null
          records_created?: number | null
          records_failed?: number | null
          records_updated?: number | null
          status?: string
          user_agent?: string | null
          webhook_config_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_webhook_config_id_fkey"
            columns: ["webhook_config_id"]
            isOneToOne: false
            referencedRelation: "webhook_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      work_permits: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          approved_by_id: string | null
          atmosphere_results: Json | null
          atmosphere_tested: boolean
          cancellation_reason: string | null
          completion_notes: string | null
          created_at: string
          emergency_equipment: string[]
          end_datetime: string
          equipment_isolated: boolean
          fire_watch_assigned_id: string | null
          fire_watch_required: boolean
          id: string
          permit_number: string
          permit_type: string
          precautions_verified: boolean
          requested_by_id: string
          risk_assessment_id: string | null
          safety_precautions_required: Json
          start_datetime: string
          status: string
          updated_at: string
          vessel_id: string
          work_description: string
          work_location: string
          workers: Json
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          approved_by_id?: string | null
          atmosphere_results?: Json | null
          atmosphere_tested?: boolean
          cancellation_reason?: string | null
          completion_notes?: string | null
          created_at?: string
          emergency_equipment?: string[]
          end_datetime: string
          equipment_isolated?: boolean
          fire_watch_assigned_id?: string | null
          fire_watch_required?: boolean
          id?: string
          permit_number: string
          permit_type: string
          precautions_verified?: boolean
          requested_by_id: string
          risk_assessment_id?: string | null
          safety_precautions_required?: Json
          start_datetime: string
          status?: string
          updated_at?: string
          vessel_id: string
          work_description: string
          work_location: string
          workers?: Json
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          approved_by_id?: string | null
          atmosphere_results?: Json | null
          atmosphere_tested?: boolean
          cancellation_reason?: string | null
          completion_notes?: string | null
          created_at?: string
          emergency_equipment?: string[]
          end_datetime?: string
          equipment_isolated?: boolean
          fire_watch_assigned_id?: string | null
          fire_watch_required?: boolean
          id?: string
          permit_number?: string
          permit_type?: string
          precautions_verified?: boolean
          requested_by_id?: string
          risk_assessment_id?: string | null
          safety_precautions_required?: Json
          start_datetime?: string
          status?: string
          updated_at?: string
          vessel_id?: string
          work_description?: string
          work_location?: string
          workers?: Json
        }
        Relationships: [
          {
            foreignKeyName: "work_permits_approved_by_id_fkey"
            columns: ["approved_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_permits_fire_watch_assigned_id_fkey"
            columns: ["fire_watch_assigned_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_permits_requested_by_id_fkey"
            columns: ["requested_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_permits_risk_assessment_id_fkey"
            columns: ["risk_assessment_id"]
            isOneToOne: false
            referencedRelation: "risk_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_permits_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acknowledge_alert_action: {
        Args: { p_alert_id: string; p_notes?: string }
        Returns: Json
      }
      assign_alert_task: {
        Args: {
          p_alert_id: string
          p_assign_to_role?: string
          p_assign_to_user_id?: string
          p_notes?: string
          p_priority?: string
        }
        Returns: Json
      }
      can_user_assign_tasks: { Args: never; Returns: boolean }
      get_dashboard_alerts: {
        Args: {
          p_all_vessels?: boolean
          p_company_id: string
          p_limit?: number
          p_vessel_id?: string
        }
        Returns: {
          created_at: string
          due_at: string
          id: string
          is_overdue: boolean
          severity: string
          source_module: string
          title: string
          vessel_id: string
          vessel_name: string
        }[]
      }
      get_expiring_certificates: {
        Args: {
          p_all_vessels?: boolean
          p_company_id: string
          p_days?: number
          p_vessel_id?: string
        }
        Returns: {
          certificate_name: string
          certificate_type: string
          crew_member_name: string
          days_until_expiry: number
          expiry_date: string
          id: string
          is_crew_cert: boolean
          vessel_id: string
          vessel_name: string
        }[]
      }
      get_recent_activity: {
        Args: {
          p_all_vessels?: boolean
          p_company_id: string
          p_limit?: number
          p_vessel_id?: string
        }
        Returns: {
          activity_type: string
          created_at: string
          description: string
          id: string
          module: string
          performed_by_name: string
          record_id: string
          title: string
          vessel_id: string
          vessel_name: string
        }[]
      }
      get_red_room_items: {
        Args: { p_company_id: string; p_vessel_id?: string }
        Returns: {
          assigned_at: string
          assigned_by_name: string
          assignment_notes: string
          assignment_priority: string
          created_at: string
          description: string
          due_at: string
          id: string
          incident_id: string
          is_direct_assignment: boolean
          is_overdue: boolean
          is_snoozed: boolean
          related_entity_id: string
          related_entity_type: string
          severity: string
          snooze_count: number
          snoozed_until: string
          source_module: string
          source_type: string
          status: string
          title: string
          vessel_id: string
          vessel_name: string
        }[]
      }
      get_upcoming_audits: {
        Args: {
          p_all_vessels?: boolean
          p_company_id: string
          p_days?: number
          p_vessel_id?: string
        }
        Returns: {
          audit_number: string
          audit_scope: string
          audit_type: string
          days_until_due: number
          id: string
          scheduled_date: string
          status: string
          vessel_id: string
          vessel_name: string
        }[]
      }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      get_user_permissions_full: {
        Args: { p_user_id: string }
        Returns: {
          can_admin: boolean
          can_edit: boolean
          can_view: boolean
          module_key: string
          module_name: string
          restrictions: Json
          scope: Database["public"]["Enums"]["role_scope_type"]
        }[]
      }
      get_user_rbac_permissions: {
        Args: { p_user_id: string }
        Returns: {
          module_key: string
          permission: Database["public"]["Enums"]["permission_level"]
          restrictions: Json
          scope: Database["public"]["Enums"]["role_scope_type"]
          source: string
        }[]
      }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: {
          company_id: string
          department: string
          role: Database["public"]["Enums"]["app_role"]
          vessel_id: string
        }[]
      }
      get_user_roles_full: {
        Args: { p_user_id: string }
        Returns: {
          department: string
          is_fleet_wide: boolean
          role_display_name: string
          role_id: string
          role_name: string
          vessel_id: string
          vessel_name: string
        }[]
      }
      get_vessel_dashboard_summary: {
        Args: {
          p_aggregate_all?: boolean
          p_company_id: string
          p_vessel_ids?: string[]
        }
        Returns: {
          audits_due_90d: number
          certs_expiring_90d: number
          classification_society: string
          crew_certs_expiring_90d: number
          crew_onboard_count: number
          critical_defects_count: number
          current_captain: string
          data_refreshed_at: string
          flag_state: string
          imo_number: string
          open_alerts_count: number
          open_capas_count: number
          open_ncs_count: number
          overdue_drills_count: number
          overdue_maintenance_count: number
          pending_signatures_count: number
          red_alerts_count: number
          training_gaps_count: number
          vessel_id: string
          vessel_name: string
        }[]
      }
      get_vessel_emergency_contacts: {
        Args: { p_vessel_id: string }
        Returns: {
          emergency_heading: string
          id: string
          logo_url: string
          primary_email: string
          primary_instruction: string
          primary_phone: string
          revision_date: string
          revision_number: number
          secondary_instruction: string
          team_members: Json
          updated_at: string
          updated_by_name: string
          vessel_id: string
        }[]
      }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_fleet_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_in_company: {
        Args: {
          _company_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_on_vessel: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
          _vessel_id: string
        }
        Returns: boolean
      }
      initialize_vessel_emergency_from_defaults: {
        Args: { p_company_id: string; p_vessel_id: string }
        Returns: string
      }
      log_permission_change: {
        Args: {
          p_action_type: Database["public"]["Enums"]["audit_action_type"]
          p_actor_role: string
          p_actor_user_id: string
          p_after_state?: Json
          p_before_state?: Json
          p_ip_address?: unknown
          p_reason_text?: string
          p_target_module_key?: string
          p_target_role_id?: string
          p_target_user_id?: string
          p_user_agent?: string
          p_vessel_scope?: string
        }
        Returns: string
      }
      snooze_alert: {
        Args: { p_alert_id: string; p_reason?: string; p_snooze_hours?: number }
        Returns: Json
      }
      update_emergency_contacts: {
        Args: {
          p_change_summary?: string
          p_company_id: string
          p_emergency_heading: string
          p_logo_url: string
          p_primary_email: string
          p_primary_instruction: string
          p_primary_phone: string
          p_secondary_instruction: string
          p_team_members: Json
          p_vessel_id: string
        }
        Returns: string
      }
      user_belongs_to_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_module_access: {
        Args: {
          p_module_key: string
          p_required_permission?: Database["public"]["Enums"]["permission_level"]
          p_user_id: string
        }
        Returns: boolean
      }
      user_has_permission: {
        Args: {
          p_module_key: string
          p_permission?: Database["public"]["Enums"]["permission_level"]
          p_user_id: string
          p_vessel_id?: string
        }
        Returns: boolean
      }
    }
    Enums: {
      alert_severity: "RED" | "ORANGE" | "YELLOW" | "GREEN"
      alert_status:
        | "OPEN"
        | "ACKNOWLEDGED"
        | "SNOOZED"
        | "RESOLVED"
        | "ESCALATED"
        | "AUTO_DISMISSED"
      app_role:
        | "superadmin"
        | "dpa"
        | "fleet_master"
        | "captain"
        | "purser"
        | "chief_officer"
        | "chief_engineer"
        | "hod"
        | "officer"
        | "crew"
        | "auditor_flag"
        | "auditor_class"
        | "travel_agent"
        | "employer_api"
      audit_action_type:
        | "role_assigned"
        | "role_removed"
        | "permission_granted"
        | "permission_revoked"
        | "permission_updated"
        | "scope_changed"
        | "override_added"
        | "override_removed"
        | "role_created"
        | "role_updated"
        | "role_deleted"
        | "api_access_granted"
        | "api_access_revoked"
        | "audit_mode_enabled"
        | "audit_mode_disabled"
      gdpr_lawful_basis:
        | "consent"
        | "contractual"
        | "legal_obligation"
        | "vital_interests"
        | "public_task"
        | "legitimate_interest"
      hr_record_type:
        | "employment_contract"
        | "salary_compensation"
        | "pay_review"
        | "annual_review"
        | "performance_evaluation"
        | "rotation_catchup"
        | "disciplinary_minor"
        | "disciplinary_serious"
        | "welfare_note"
        | "training_record"
        | "leave_record"
        | "medical_record"
      permission_level: "view" | "edit" | "admin"
      record_lifecycle_status:
        | "active"
        | "pending_archive"
        | "archived"
        | "pending_deletion"
        | "anonymized"
      role_scope_type: "fleet" | "vessel" | "department" | "self"
      user_role:
        | "master"
        | "chief_engineer"
        | "chief_officer"
        | "crew"
        | "dpa"
        | "shore_management"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      alert_severity: ["RED", "ORANGE", "YELLOW", "GREEN"],
      alert_status: [
        "OPEN",
        "ACKNOWLEDGED",
        "SNOOZED",
        "RESOLVED",
        "ESCALATED",
        "AUTO_DISMISSED",
      ],
      app_role: [
        "superadmin",
        "dpa",
        "fleet_master",
        "captain",
        "purser",
        "chief_officer",
        "chief_engineer",
        "hod",
        "officer",
        "crew",
        "auditor_flag",
        "auditor_class",
        "travel_agent",
        "employer_api",
      ],
      audit_action_type: [
        "role_assigned",
        "role_removed",
        "permission_granted",
        "permission_revoked",
        "permission_updated",
        "scope_changed",
        "override_added",
        "override_removed",
        "role_created",
        "role_updated",
        "role_deleted",
        "api_access_granted",
        "api_access_revoked",
        "audit_mode_enabled",
        "audit_mode_disabled",
      ],
      gdpr_lawful_basis: [
        "consent",
        "contractual",
        "legal_obligation",
        "vital_interests",
        "public_task",
        "legitimate_interest",
      ],
      hr_record_type: [
        "employment_contract",
        "salary_compensation",
        "pay_review",
        "annual_review",
        "performance_evaluation",
        "rotation_catchup",
        "disciplinary_minor",
        "disciplinary_serious",
        "welfare_note",
        "training_record",
        "leave_record",
        "medical_record",
      ],
      permission_level: ["view", "edit", "admin"],
      record_lifecycle_status: [
        "active",
        "pending_archive",
        "archived",
        "pending_deletion",
        "anonymized",
      ],
      role_scope_type: ["fleet", "vessel", "department", "self"],
      user_role: [
        "master",
        "chief_engineer",
        "chief_officer",
        "crew",
        "dpa",
        "shore_management",
      ],
    },
  },
} as const
