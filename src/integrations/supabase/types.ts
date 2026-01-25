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
