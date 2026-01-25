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
          created_at: string
          id: string
          imo_company_number: string | null
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          brand_color?: string | null
          client_display_name?: string | null
          client_logo_url?: string | null
          created_at?: string
          id?: string
          imo_company_number?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          brand_color?: string | null
          client_display_name?: string | null
          client_logo_url?: string | null
          created_at?: string
          id?: string
          imo_company_number?: string | null
          name?: string
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
          created_at: string
          id: string
          is_current: boolean | null
          join_date: string
          leave_date: string | null
          position: string
          updated_at: string
          user_id: string
          vessel_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_current?: boolean | null
          join_date: string
          leave_date?: string | null
          position: string
          updated_at?: string
          user_id: string
          vessel_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_current?: boolean | null
          join_date?: string
          leave_date?: string | null
          position?: string
          updated_at?: string
          user_id?: string
          vessel_id?: string
        }
        Relationships: [
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
          company_id: string
          contributing_factors: string[] | null
          created_at: string
          description: string
          dpa_notified: boolean | null
          dpa_notified_date: string | null
          id: string
          immediate_action: string | null
          incident_date: string
          incident_number: string
          incident_type: string
          investigation_required: boolean | null
          investigation_status: string | null
          location: string
          persons_involved: Json | null
          reported_by: string
          reported_date: string
          root_cause: string | null
          severity_actual: number
          severity_potential: number
          status: string | null
          updated_at: string
          vessel_id: string
          witnesses: Json | null
        }
        Insert: {
          attachments?: Json | null
          company_id: string
          contributing_factors?: string[] | null
          created_at?: string
          description: string
          dpa_notified?: boolean | null
          dpa_notified_date?: string | null
          id?: string
          immediate_action?: string | null
          incident_date: string
          incident_number: string
          incident_type: string
          investigation_required?: boolean | null
          investigation_status?: string | null
          location: string
          persons_involved?: Json | null
          reported_by: string
          reported_date?: string
          root_cause?: string | null
          severity_actual: number
          severity_potential: number
          status?: string | null
          updated_at?: string
          vessel_id: string
          witnesses?: Json | null
        }
        Update: {
          attachments?: Json | null
          company_id?: string
          contributing_factors?: string[] | null
          created_at?: string
          description?: string
          dpa_notified?: boolean | null
          dpa_notified_date?: string | null
          id?: string
          immediate_action?: string | null
          incident_date?: string
          incident_number?: string
          incident_type?: string
          investigation_required?: boolean | null
          investigation_status?: string | null
          location?: string
          persons_involved?: Json | null
          reported_by?: string
          reported_date?: string
          root_cause?: string | null
          severity_actual?: number
          severity_potential?: number
          status?: string | null
          updated_at?: string
          vessel_id?: string
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
      profiles: {
        Row: {
          company_id: string | null
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          nationality: string | null
          phone: string | null
          rank: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email: string
          first_name: string
          id?: string
          last_name: string
          nationality?: string | null
          phone?: string | null
          rank?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          nationality?: string | null
          phone?: string | null
          rank?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: string | null
          updated_at?: string
          user_id?: string
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
      vessels: {
        Row: {
          build_year: number | null
          classification_society: string | null
          company_id: string
          created_at: string
          flag_state: string | null
          gross_tonnage: number | null
          id: string
          imo_number: string | null
          name: string
          status: string | null
          updated_at: string
          vessel_type: string | null
        }
        Insert: {
          build_year?: number | null
          classification_society?: string | null
          company_id: string
          created_at?: string
          flag_state?: string | null
          gross_tonnage?: number | null
          id?: string
          imo_number?: string | null
          name: string
          status?: string | null
          updated_at?: string
          vessel_type?: string | null
        }
        Update: {
          build_year?: number | null
          classification_society?: string | null
          company_id?: string
          created_at?: string
          flag_state?: string | null
          gross_tonnage?: number | null
          id?: string
          imo_number?: string | null
          name?: string
          status?: string | null
          updated_at?: string
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
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      user_belongs_to_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
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
