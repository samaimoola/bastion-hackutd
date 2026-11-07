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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      guide_conversations: {
        Row: {
          blocked_reason: string | null
          blocked_status: number | null
          created_at: string
          id: string
          messages: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          blocked_reason?: string | null
          blocked_status?: number | null
          created_at?: string
          id?: string
          messages?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          blocked_reason?: string | null
          blocked_status?: number | null
          created_at?: string
          id?: string
          messages?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      incident_invitations: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          incident_id: string
          issuer_id: string
          redeemed_at: string | null
          redeemed_by: string | null
          role: Database["public"]["Enums"]["incident_member_role"]
          token_hash: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          incident_id: string
          issuer_id: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          role: Database["public"]["Enums"]["incident_member_role"]
          token_hash: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          incident_id?: string
          issuer_id?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          role?: Database["public"]["Enums"]["incident_member_role"]
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_invitations_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_members: {
        Row: {
          incident_id: string
          role: Database["public"]["Enums"]["incident_member_role"]
          user_id: string
        }
        Insert: {
          incident_id: string
          role: Database["public"]["Enums"]["incident_member_role"]
          user_id: string
        }
        Update: {
          incident_id?: string
          role?: Database["public"]["Enums"]["incident_member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_members_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          created_at: string
          creator_id: string
          description: string
          id: string
          response_stage: Database["public"]["Enums"]["incident_response_stage"]
          severity: Database["public"]["Enums"]["incident_severity"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          description?: string
          id?: string
          response_stage?: Database["public"]["Enums"]["incident_response_stage"]
          severity?: Database["public"]["Enums"]["incident_severity"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          description?: string
          id?: string
          response_stage?: Database["public"]["Enums"]["incident_response_stage"]
          severity?: Database["public"]["Enums"]["incident_severity"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_incident: {
        Args: {
          _description?: string
          _response_stage?: Database["public"]["Enums"]["incident_response_stage"]
          _severity?: Database["public"]["Enums"]["incident_severity"]
          _title: string
        }
        Returns: {
          created_at: string
          creator_id: string
          description: string
          id: string
          response_stage: Database["public"]["Enums"]["incident_response_stage"]
          severity: Database["public"]["Enums"]["incident_severity"]
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "incidents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      issue_incident_invitation: {
        Args: {
          _incident_id: string
          _role: Database["public"]["Enums"]["incident_member_role"]
          _token_hash: string
        }
        Returns: string
      }
      redeem_incident_invitation: {
        Args: { _token_hash: string }
        Returns: string
      }
      remove_incident_member: {
        Args: { _incident_id: string; _user_id: string }
        Returns: undefined
      }
      set_incident_member: {
        Args: {
          _incident_id: string
          _role: Database["public"]["Enums"]["incident_member_role"]
          _user_id: string
        }
        Returns: {
          incident_id: string
          role: Database["public"]["Enums"]["incident_member_role"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "incident_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_incident_details: {
        Args: {
          _description: string
          _incident_id: string
          _response_stage: Database["public"]["Enums"]["incident_response_stage"]
          _severity: Database["public"]["Enums"]["incident_severity"]
          _title: string
        }
        Returns: {
          created_at: string
          creator_id: string
          description: string
          id: string
          response_stage: Database["public"]["Enums"]["incident_response_stage"]
          severity: Database["public"]["Enums"]["incident_severity"]
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "incidents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      incident_member_role: "commander" | "responder" | "viewer"
      incident_response_stage:
        | "Detection"
        | "Containment"
        | "Eradication"
        | "Recovery"
        | "Post-incident"
      incident_severity: "Critical" | "High" | "Medium" | "Low"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      incident_member_role: ["commander", "responder", "viewer"],
      incident_response_stage: [
        "Detection",
        "Containment",
        "Eradication",
        "Recovery",
        "Post-incident",
      ],
      incident_severity: ["Critical", "High", "Medium", "Low"],
    },
  },
} as const
