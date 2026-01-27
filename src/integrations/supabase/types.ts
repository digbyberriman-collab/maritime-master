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
      profiles: {
        Row: {
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
          last_name: string
          medical_expiry: string | null
          nationality: string | null
          notes: string | null
          passport_expiry: string | null
          passport_number: string | null
          phone: string | null
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
          last_name: string
          medical_expiry?: string | null
          nationality?: string | null
          notes?: string | null
          passport_expiry?: string | null
          passport_number?: string | null
          phone?: string | null
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
          last_name?: string
          medical_expiry?: string | null
          nationality?: string | null
          notes?: string | null
          passport_expiry?: string | null
          passport_number?: string | null
          phone?: string | null
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
