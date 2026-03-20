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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      client_audit_logs: {
        Row: {
          action: string
          changed_by: string | null
          client_id: string
          created_at: string
          field_name: string | null
          id: string
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          action: string
          changed_by?: string | null
          client_id: string
          created_at?: string
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          action?: string
          changed_by?: string | null
          client_id?: string
          created_at?: string
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_audit_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          contact_name: string
          created_at: string
          email: string | null
          id: string
          mobile: string | null
          notes: string | null
          phone: string | null
          role_function: string | null
        }
        Insert: {
          client_id: string
          contact_name: string
          created_at?: string
          email?: string | null
          id?: string
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          role_function?: string | null
        }
        Update: {
          client_id?: string
          contact_name?: string
          created_at?: string
          email?: string | null
          id?: string
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          role_function?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_credentials: {
        Row: {
          admin_notes: string | null
          client_id: string
          created_at: string
          environment_type: string | null
          id: string
          login: string | null
          password_secret: string | null
          system_url: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          admin_notes?: string | null
          client_id: string
          created_at?: string
          environment_type?: string | null
          id?: string
          login?: string | null
          password_secret?: string | null
          system_url?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          admin_notes?: string | null
          client_id?: string
          created_at?: string
          environment_type?: string | null
          id?: string
          login?: string | null
          password_secret?: string | null
          system_url?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_credentials_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notes: {
        Row: {
          client_id: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          note_type: string | null
        }
        Insert: {
          client_id: string
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          note_type?: string | null
        }
        Update: {
          client_id?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          account_manager: string | null
          address: string | null
          auto_update: boolean
          award_reference: string | null
          city: string | null
          client_code: string
          cloud_onpremise: string | null
          commercial_name: string
          country: string | null
          created_at: string
          current_version: string | null
          email: string | null
          fax: string | null
          first_installation_date: string | null
          first_installed_version: string | null
          has_custom_reports: boolean
          has_custom_routine: boolean
          id: string
          installation_location: string | null
          is_inactive: boolean
          is_premium: boolean
          license_type: string | null
          manager_owner: string | null
          observations: string | null
          partner_id: string | null
          phone: string | null
          postal_code: string | null
          product_type: string | null
          sector: string | null
          short_name: string | null
          state_region: string | null
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          account_manager?: string | null
          address?: string | null
          auto_update?: boolean
          award_reference?: string | null
          city?: string | null
          client_code: string
          cloud_onpremise?: string | null
          commercial_name: string
          country?: string | null
          created_at?: string
          current_version?: string | null
          email?: string | null
          fax?: string | null
          first_installation_date?: string | null
          first_installed_version?: string | null
          has_custom_reports?: boolean
          has_custom_routine?: boolean
          id?: string
          installation_location?: string | null
          is_inactive?: boolean
          is_premium?: boolean
          license_type?: string | null
          manager_owner?: string | null
          observations?: string | null
          partner_id?: string | null
          phone?: string | null
          postal_code?: string | null
          product_type?: string | null
          sector?: string | null
          short_name?: string | null
          state_region?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          account_manager?: string | null
          address?: string | null
          auto_update?: boolean
          award_reference?: string | null
          city?: string | null
          client_code?: string
          cloud_onpremise?: string | null
          commercial_name?: string
          country?: string | null
          created_at?: string
          current_version?: string | null
          email?: string | null
          fax?: string | null
          first_installation_date?: string | null
          first_installed_version?: string | null
          has_custom_reports?: boolean
          has_custom_routine?: boolean
          id?: string
          installation_location?: string | null
          is_inactive?: boolean
          is_premium?: boolean
          license_type?: string | null
          manager_owner?: string | null
          observations?: string | null
          partner_id?: string | null
          phone?: string | null
          postal_code?: string | null
          product_type?: string | null
          sector?: string | null
          short_name?: string | null
          state_region?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      commissions: {
        Row: {
          approved_at: string | null
          commission_type: string
          commission_value: number | null
          created_at: string
          deal_id: string | null
          id: string
          notes: string | null
          paid_at: string | null
          partner_id: string
          partner_margin_pct: number | null
          payment_status: string
          services_revenue: number | null
          software_revenue: number | null
        }
        Insert: {
          approved_at?: string | null
          commission_type?: string
          commission_value?: number | null
          created_at?: string
          deal_id?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          partner_id: string
          partner_margin_pct?: number | null
          payment_status?: string
          services_revenue?: number | null
          software_revenue?: number | null
        }
        Update: {
          approved_at?: string | null
          commission_type?: string
          commission_value?: number | null
          created_at?: string
          deal_id?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          partner_id?: string
          partner_margin_pct?: number | null
          payment_status?: string
          services_revenue?: number | null
          software_revenue?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "commissions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          billing_notes: string | null
          client_id: string
          contract_end_date: string | null
          contract_start_date: string | null
          contract_value: number | null
          created_at: string
          currency: string | null
          hosting_value: number | null
          id: string
          invoiced_value: number | null
          mww_web_value: number | null
          notice_period_days: number | null
          num_installments: number | null
          observations: string | null
          partner_revenue_split: number | null
          price_table_reference: string | null
          renewal_freeze_notes: string | null
          renewal_increase_pct: number | null
          sat_value: number | null
          total_value: number | null
          updated_at: string
        }
        Insert: {
          billing_notes?: string | null
          client_id: string
          contract_end_date?: string | null
          contract_start_date?: string | null
          contract_value?: number | null
          created_at?: string
          currency?: string | null
          hosting_value?: number | null
          id?: string
          invoiced_value?: number | null
          mww_web_value?: number | null
          notice_period_days?: number | null
          num_installments?: number | null
          observations?: string | null
          partner_revenue_split?: number | null
          price_table_reference?: string | null
          renewal_freeze_notes?: string | null
          renewal_increase_pct?: number | null
          sat_value?: number | null
          total_value?: number | null
          updated_at?: string
        }
        Update: {
          billing_notes?: string | null
          client_id?: string
          contract_end_date?: string | null
          contract_start_date?: string | null
          contract_value?: number | null
          created_at?: string
          currency?: string | null
          hosting_value?: number | null
          id?: string
          invoiced_value?: number | null
          mww_web_value?: number | null
          notice_period_days?: number | null
          num_installments?: number | null
          observations?: string | null
          partner_revenue_split?: number | null
          price_table_reference?: string | null
          renewal_freeze_notes?: string | null
          renewal_increase_pct?: number | null
          sat_value?: number | null
          total_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_activities: {
        Row: {
          activity_type: string
          created_at: string
          deal_id: string
          description: string | null
          id: string
          performed_by: string | null
          subject: string | null
        }
        Insert: {
          activity_type?: string
          created_at?: string
          deal_id: string
          description?: string | null
          id?: string
          performed_by?: string | null
          subject?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string
          deal_id?: string
          description?: string | null
          id?: string
          performed_by?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_contacts: {
        Row: {
          contact_name: string
          created_at: string
          deal_id: string
          email: string | null
          id: string
          is_decision_maker: boolean | null
          notes: string | null
          phone: string | null
          role: string | null
        }
        Insert: {
          contact_name: string
          created_at?: string
          deal_id: string
          email?: string | null
          id?: string
          is_decision_maker?: boolean | null
          notes?: string | null
          phone?: string | null
          role?: string | null
        }
        Update: {
          contact_name?: string
          created_at?: string
          deal_id?: string
          email?: string | null
          id?: string
          is_decision_maker?: boolean | null
          notes?: string | null
          phone?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_contacts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_registrations: {
        Row: {
          conflict_deal_id: string | null
          deal_id: string
          id: string
          notes: string | null
          partner_id: string
          registration_status: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          submitted_at: string
        }
        Insert: {
          conflict_deal_id?: string | null
          deal_id: string
          id?: string
          notes?: string | null
          partner_id: string
          registration_status?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          submitted_at?: string
        }
        Update: {
          conflict_deal_id?: string | null
          deal_id?: string
          id?: string
          notes?: string | null
          partner_id?: string
          registration_status?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_registrations_conflict_deal_id_fkey"
            columns: ["conflict_deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_registrations_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          deal_id: string
          description: string | null
          due_date: string | null
          id: string
          is_completed: boolean | null
          title: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          deal_id: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean | null
          title: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          deal_id?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          aging_days: number | null
          assigned_salesperson: string | null
          company_name: string
          country: string | null
          created_at: string
          description: string | null
          expected_close_date: string | null
          expected_value: number | null
          id: string
          industry: string | null
          last_activity_at: string | null
          lead_source: string | null
          notes: string | null
          partner_id: string | null
          probability: number | null
          stage: string
          stage_entered_at: string | null
          status: string
          total_value: number | null
          updated_at: string
        }
        Insert: {
          aging_days?: number | null
          assigned_salesperson?: string | null
          company_name: string
          country?: string | null
          created_at?: string
          description?: string | null
          expected_close_date?: string | null
          expected_value?: number | null
          id?: string
          industry?: string | null
          last_activity_at?: string | null
          lead_source?: string | null
          notes?: string | null
          partner_id?: string | null
          probability?: number | null
          stage?: string
          stage_entered_at?: string | null
          status?: string
          total_value?: number | null
          updated_at?: string
        }
        Update: {
          aging_days?: number | null
          assigned_salesperson?: string | null
          company_name?: string
          country?: string | null
          created_at?: string
          description?: string | null
          expected_close_date?: string | null
          expected_value?: number | null
          id?: string
          industry?: string | null
          last_activity_at?: string | null
          lead_source?: string | null
          notes?: string | null
          partner_id?: string | null
          probability?: number | null
          stage?: string
          stage_entered_at?: string | null
          status?: string
          total_value?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      licensed_modules: {
        Row: {
          created_at: string
          enabled: boolean
          end_date: string | null
          id: string
          license_id: string
          license_type: string | null
          module_name: string
          notes: string | null
          periodicity: string | null
          start_date: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          end_date?: string | null
          id?: string
          license_id: string
          license_type?: string | null
          module_name: string
          notes?: string | null
          periodicity?: string | null
          start_date?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          end_date?: string | null
          id?: string
          license_id?: string
          license_type?: string | null
          module_name?: string
          notes?: string | null
          periodicity?: string | null
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "licensed_modules_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      licenses: {
        Row: {
          api_access: boolean
          backoffice_employee_users: number | null
          backoffice_users: number | null
          client_id: string
          created_at: string
          database_type: string | null
          id: string
          license_end_date: string | null
          license_model: string | null
          license_start_date: string | null
          mobile_users: number | null
          periodicity: string | null
          product: string | null
          sat_active: boolean
          sat_end_date: string | null
          updated_at: string
          version: string | null
          web_accesses: number | null
        }
        Insert: {
          api_access?: boolean
          backoffice_employee_users?: number | null
          backoffice_users?: number | null
          client_id: string
          created_at?: string
          database_type?: string | null
          id?: string
          license_end_date?: string | null
          license_model?: string | null
          license_start_date?: string | null
          mobile_users?: number | null
          periodicity?: string | null
          product?: string | null
          sat_active?: boolean
          sat_end_date?: string | null
          updated_at?: string
          version?: string | null
          web_accesses?: number | null
        }
        Update: {
          api_access?: boolean
          backoffice_employee_users?: number | null
          backoffice_users?: number | null
          client_id?: string
          created_at?: string
          database_type?: string | null
          id?: string
          license_end_date?: string | null
          license_model?: string | null
          license_start_date?: string | null
          mobile_users?: number | null
          periodicity?: string | null
          product?: string | null
          sat_active?: boolean
          sat_end_date?: string | null
          updated_at?: string
          version?: string | null
          web_accesses?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "licenses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          category: string | null
          client_id: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          partner_id: string | null
          renewal_id: string | null
          target_role: string | null
          target_user_id: string | null
          title: string
          type: string
        }
        Insert: {
          action_url?: string | null
          category?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          partner_id?: string | null
          renewal_id?: string | null
          target_role?: string | null
          target_user_id?: string | null
          title: string
          type?: string
        }
        Update: {
          action_url?: string | null
          category?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          partner_id?: string | null
          renewal_id?: string | null
          target_role?: string | null
          target_user_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_renewal_id_fkey"
            columns: ["renewal_id"]
            isOneToOne: false
            referencedRelation: "renewals"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_renewal_settings: {
        Row: {
          created_at: string
          green_days: number
          id: string
          orange_days: number
          partner_id: string
          updated_at: string
          yellow_days: number
        }
        Insert: {
          created_at?: string
          green_days?: number
          id?: string
          orange_days?: number
          partner_id: string
          updated_at?: string
          yellow_days?: number
        }
        Update: {
          created_at?: string
          green_days?: number
          id?: string
          orange_days?: number
          partner_id?: string
          updated_at?: string
          yellow_days?: number
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_due: number | null
          amount_paid: number | null
          billing_notes: string | null
          client_id: string
          contract_id: string | null
          created_at: string
          due_date: string | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          last_payment_date: string | null
          outstanding_balance: number | null
          payment_status: string
        }
        Insert: {
          amount_due?: number | null
          amount_paid?: number | null
          billing_notes?: string | null
          client_id: string
          contract_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          last_payment_date?: string | null
          outstanding_balance?: number | null
          payment_status?: string
        }
        Update: {
          amount_due?: number | null
          amount_paid?: number | null
          billing_notes?: string | null
          client_id?: string
          contract_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          last_payment_date?: string | null
          outstanding_balance?: number | null
          payment_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      renewal_activities: {
        Row: {
          action: string
          created_at: string
          from_status: string | null
          id: string
          notes: string | null
          performed_by: string | null
          renewal_id: string
          to_status: string | null
        }
        Insert: {
          action: string
          created_at?: string
          from_status?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
          renewal_id: string
          to_status?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          from_status?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
          renewal_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "renewal_activities_renewal_id_fkey"
            columns: ["renewal_id"]
            isOneToOne: false
            referencedRelation: "renewals"
            referencedColumns: ["id"]
          },
        ]
      }
      renewals: {
        Row: {
          alert_window_days: number | null
          assigned_owner: string | null
          client_id: string
          contract_id: string | null
          created_at: string
          estimated_value: number | null
          final_value: number | null
          id: string
          last_interaction: string | null
          license_id: string | null
          notes: string | null
          partner_id: string | null
          priority: string | null
          renewal_date: string | null
          renewal_type: string
          status: string
          updated_at: string
        }
        Insert: {
          alert_window_days?: number | null
          assigned_owner?: string | null
          client_id: string
          contract_id?: string | null
          created_at?: string
          estimated_value?: number | null
          final_value?: number | null
          id?: string
          last_interaction?: string | null
          license_id?: string | null
          notes?: string | null
          partner_id?: string | null
          priority?: string | null
          renewal_date?: string | null
          renewal_type?: string
          status?: string
          updated_at?: string
        }
        Update: {
          alert_window_days?: number | null
          assigned_owner?: string | null
          client_id?: string
          contract_id?: string | null
          created_at?: string
          estimated_value?: number | null
          final_value?: number | null
          id?: string
          last_interaction?: string | null
          license_id?: string | null
          notes?: string | null
          partner_id?: string | null
          priority?: string | null
          renewal_date?: string | null
          renewal_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "renewals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewals_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewals_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
