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
          alert_type: string
          assigned_to_user_id: string | null
          company_id: string
          created_at: string | null
          description: string | null
          due_at: string | null
          escalated_at: string | null
          escalated_to_user_ids: string[] | null
          escalation_level: number | null
          id: string
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
          alert_type: string
          assigned_to_user_id?: string | null
          company_id: string
          created_at?: string | null
          description?: string | null
          due_at?: string | null
          escalated_at?: string | null
          escalated_to_user_ids?: string[] | null
          escalation_level?: number | null
          id?: string
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
          alert_type?: string
          assigned_to_user_id?: string | null
          company_id?: string
          created_at?: string | null
          description?: string | null
          due_at?: string | null
          escalated_at?: string | null
          escalated_to_user_ids?: string[] | null
          escalation_level?: number | null
          id?: string
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
      profiles: {
        Row: {
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
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
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
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: {
          company_id: string
          department: string
          role: Database["public"]["Enums"]["app_role"]
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
      user_belongs_to_company: {
        Args: { _company_id: string; _user_id: string }
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
