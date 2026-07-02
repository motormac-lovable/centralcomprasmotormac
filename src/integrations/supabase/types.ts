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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      approver_settings: {
        Row: {
          created_at: string
          departments: string[]
          teto_alcada: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          departments?: string[]
          teto_alcada?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          departments?: string[]
          teto_alcada?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      buyer_applications: {
        Row: {
          checklist_types: string[]
          cpf: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          email: string
          full_name: string
          id: string
          pending_password: string | null
          phone: string
          requested_ceiling: number | null
          requested_departments: string[]
          status: Database["public"]["Enums"]["application_status"]
          user_id: string | null
        }
        Insert: {
          checklist_types?: string[]
          cpf: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          email: string
          full_name: string
          id?: string
          pending_password?: string | null
          phone: string
          requested_ceiling?: number | null
          requested_departments?: string[]
          status?: Database["public"]["Enums"]["application_status"]
          user_id?: string | null
        }
        Update: {
          checklist_types?: string[]
          cpf?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          email?: string
          full_name?: string
          id?: string
          pending_password?: string | null
          phone?: string
          requested_ceiling?: number | null
          requested_departments?: string[]
          status?: Database["public"]["Enums"]["application_status"]
          user_id?: string | null
        }
        Relationships: []
      }
      departments: {
        Row: {
          code: number
          created_at: string
          name: string
          updated_at: string
        }
        Insert: {
          code: number
          created_at?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: number
          created_at?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      kanban_cards: {
        Row: {
          approver_id: string | null
          approver_name: string | null
          assigned_to: string | null
          attachments: Json
          codigo_unico: string | null
          created_at: string
          data: Json
          empresa: string | null
          id: string
          kind: Database["public"]["Enums"]["card_kind"]
          numero_pedido_linx: string | null
          observations: Json
          order_number: string | null
          ready_for_apollo_integration: boolean
          requester_email: string | null
          requester_name: string | null
          status: Database["public"]["Enums"]["card_status"]
          status_changed_at: string
          summary: string | null
          suppliers: Json
          title: string
          unidade: string | null
          updated_at: string
        }
        Insert: {
          approver_id?: string | null
          approver_name?: string | null
          assigned_to?: string | null
          attachments?: Json
          codigo_unico?: string | null
          created_at?: string
          data?: Json
          empresa?: string | null
          id?: string
          kind: Database["public"]["Enums"]["card_kind"]
          numero_pedido_linx?: string | null
          observations?: Json
          order_number?: string | null
          ready_for_apollo_integration?: boolean
          requester_email?: string | null
          requester_name?: string | null
          status?: Database["public"]["Enums"]["card_status"]
          status_changed_at?: string
          summary?: string | null
          suppliers?: Json
          title: string
          unidade?: string | null
          updated_at?: string
        }
        Update: {
          approver_id?: string | null
          approver_name?: string | null
          assigned_to?: string | null
          attachments?: Json
          codigo_unico?: string | null
          created_at?: string
          data?: Json
          empresa?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["card_kind"]
          numero_pedido_linx?: string | null
          observations?: Json
          order_number?: string | null
          ready_for_apollo_integration?: boolean
          requester_email?: string | null
          requester_name?: string | null
          status?: Database["public"]["Enums"]["card_status"]
          status_changed_at?: string
          summary?: string | null
          suppliers?: Json
          title?: string
          unidade?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      origins: {
        Row: {
          code: number
          created_at: string
          name: string
          updated_at: string
        }
        Insert: {
          code: number
          created_at?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: number
          created_at?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          cpf: string | null
          created_at: string
          deactivated_at: string | null
          deactivated_by: string | null
          deactivated_by_name: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_by_name: string | null
          email: string | null
          force_logout_at: string | null
          full_name: string | null
          id: string
          is_active: boolean
          is_deleted: boolean
          original_email: string | null
          original_full_name: string | null
          phone: string | null
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivated_by_name?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_name?: string | null
          email?: string | null
          force_logout_at?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          is_deleted?: boolean
          original_email?: string | null
          original_full_name?: string | null
          phone?: string | null
        }
        Update: {
          cpf?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivated_by_name?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_name?: string | null
          email?: string | null
          force_logout_at?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          original_email?: string | null
          original_full_name?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      user_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          actor_user_name: string | null
          created_at: string
          details: Json
          id: string
          target_user_email: string | null
          target_user_id: string | null
          target_user_name: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          actor_user_name?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_user_email?: string | null
          target_user_id?: string | null
          target_user_name?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          actor_user_name?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_user_email?: string | null
          target_user_id?: string | null
          target_user_name?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      profiles_directory: {
        Row: {
          email: string | null
          full_name: string | null
          id: string | null
          is_active: boolean | null
        }
        Insert: {
          email?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
        }
        Update: {
          email?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
        }
        Relationships: []
      }
    }
    Functions: {
      approve_kanban_card: {
        Args: {
          _card_id: string
          _justificativa: string
          _selected_supplier_id: string
        }
        Returns: {
          approver_id: string | null
          approver_name: string | null
          assigned_to: string | null
          attachments: Json
          codigo_unico: string | null
          created_at: string
          data: Json
          empresa: string | null
          id: string
          kind: Database["public"]["Enums"]["card_kind"]
          numero_pedido_linx: string | null
          observations: Json
          order_number: string | null
          ready_for_apollo_integration: boolean
          requester_email: string | null
          requester_name: string | null
          status: Database["public"]["Enums"]["card_status"]
          status_changed_at: string
          summary: string | null
          suppliers: Json
          title: string
          unidade: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "kanban_cards"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gerar_codigo_unico: { Args: never; Returns: string }
      get_profile_pii: {
        Args: { _user_id: string }
        Returns: {
          cpf: string
          phone: string
        }[]
      }
      has_approver_for_department: { Args: { _dept: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mark_profile_deleted: {
        Args: { _actor: string; _actor_name: string; _target: string }
        Returns: undefined
      }
      reject_kanban_card: {
        Args: { _card_id: string; _motivo: string }
        Returns: {
          approver_id: string | null
          approver_name: string | null
          assigned_to: string | null
          attachments: Json
          codigo_unico: string | null
          created_at: string
          data: Json
          empresa: string | null
          id: string
          kind: Database["public"]["Enums"]["card_kind"]
          numero_pedido_linx: string | null
          observations: Json
          order_number: string | null
          ready_for_apollo_integration: boolean
          requester_email: string | null
          requester_name: string | null
          status: Database["public"]["Enums"]["card_status"]
          status_changed_at: string
          summary: string | null
          suppliers: Json
          title: string
          unidade: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "kanban_cards"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_user_active: {
        Args: {
          _active: boolean
          _actor: string
          _actor_name: string
          _target: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "buyer"
        | "owner"
        | "solicitante"
        | "aprovador"
        | "auditor"
      application_status: "pending" | "approved" | "rejected"
      card_kind: "compras" | "contratos" | "frete" | "materiais"
      card_status:
        | "solicitacoes_abertas"
        | "em_cotacao"
        | "aguardando_aprovacao"
        | "cotacoes_rejeitadas"
        | "cotacoes_aprovadas"
        | "pedidos_gerados"
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
      app_role: [
        "admin",
        "buyer",
        "owner",
        "solicitante",
        "aprovador",
        "auditor",
      ],
      application_status: ["pending", "approved", "rejected"],
      card_kind: ["compras", "contratos", "frete", "materiais"],
      card_status: [
        "solicitacoes_abertas",
        "em_cotacao",
        "aguardando_aprovacao",
        "cotacoes_rejeitadas",
        "cotacoes_aprovadas",
        "pedidos_gerados",
      ],
    },
  },
} as const
