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
          phone: string
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
          phone: string
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
          phone?: string
          status?: Database["public"]["Enums"]["application_status"]
          user_id?: string | null
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
      profiles: {
        Row: {
          cpf: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
        }
        Update: {
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
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
      [_ in never]: never
    }
    Functions: {
      gerar_codigo_unico: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "buyer" | "owner"
      application_status: "pending" | "approved" | "rejected"
      card_kind: "compras" | "contratos" | "frete"
      card_status:
        | "solicitacoes_abertas"
        | "em_cotacao"
        | "aguardando_aprovacao"
        | "cotacoes_rejeitadas"
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
      app_role: ["admin", "buyer", "owner"],
      application_status: ["pending", "approved", "rejected"],
      card_kind: ["compras", "contratos", "frete"],
      card_status: [
        "solicitacoes_abertas",
        "em_cotacao",
        "aguardando_aprovacao",
        "cotacoes_rejeitadas",
        "pedidos_gerados",
      ],
    },
  },
} as const
