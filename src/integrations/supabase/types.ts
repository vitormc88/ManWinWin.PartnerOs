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
      _backup_partners_v1: {
        Row: {
          account_owner_id: string | null
          alert_notice_days: number | null
          assigned_manager_id: string | null
          company_name: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          health_score: number | null
          id: string | null
          is_active: boolean | null
          last_meeting_date: string | null
          legal_name: string | null
          meeting_cadence: string | null
          next_meeting_date: string | null
          notes: string | null
          number_of_clients: number | null
          onboarding_status: string | null
          partner_code: string | null
          partner_type: string | null
          partnership_level: string | null
          phone: string | null
          pipeline_value: number | null
          primary_contact_email: string | null
          primary_contact_name: string | null
          region: string | null
          relationship_status: string | null
          revenue_ytd: number | null
          start_date: string | null
          status: string | null
          tier_id: number | null
          total_revenue: number | null
          updated_at: string | null
          updated_by: string | null
          uses_manwinwin_database: boolean | null
          uses_own_database: boolean | null
          website: string | null
        }
        Insert: {
          account_owner_id?: string | null
          alert_notice_days?: number | null
          assigned_manager_id?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          health_score?: number | null
          id?: string | null
          is_active?: boolean | null
          last_meeting_date?: string | null
          legal_name?: string | null
          meeting_cadence?: string | null
          next_meeting_date?: string | null
          notes?: string | null
          number_of_clients?: number | null
          onboarding_status?: string | null
          partner_code?: string | null
          partner_type?: string | null
          partnership_level?: string | null
          phone?: string | null
          pipeline_value?: number | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          region?: string | null
          relationship_status?: string | null
          revenue_ytd?: number | null
          start_date?: string | null
          status?: string | null
          tier_id?: number | null
          total_revenue?: number | null
          updated_at?: string | null
          updated_by?: string | null
          uses_manwinwin_database?: boolean | null
          uses_own_database?: boolean | null
          website?: string | null
        }
        Update: {
          account_owner_id?: string | null
          alert_notice_days?: number | null
          assigned_manager_id?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          health_score?: number | null
          id?: string | null
          is_active?: boolean | null
          last_meeting_date?: string | null
          legal_name?: string | null
          meeting_cadence?: string | null
          next_meeting_date?: string | null
          notes?: string | null
          number_of_clients?: number | null
          onboarding_status?: string | null
          partner_code?: string | null
          partner_type?: string | null
          partnership_level?: string | null
          phone?: string | null
          pipeline_value?: number | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          region?: string | null
          relationship_status?: string | null
          revenue_ytd?: number | null
          start_date?: string | null
          status?: string | null
          tier_id?: number | null
          total_revenue?: number | null
          updated_at?: string | null
          updated_by?: string | null
          uses_manwinwin_database?: boolean | null
          uses_own_database?: boolean | null
          website?: string | null
        }
        Relationships: []
      }
      _backup_profiles_v1: {
        Row: {
          avatar_url: string | null
          certification_level: number | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string | null
          invitation_status: string | null
          is_active: boolean | null
          is_hq: boolean | null
          last_login_at: string | null
          onboarding_completion_pct: number | null
          partner_id: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          certification_level?: number | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          invitation_status?: string | null
          is_active?: boolean | null
          is_hq?: boolean | null
          last_login_at?: string | null
          onboarding_completion_pct?: number | null
          partner_id?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          certification_level?: number | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          invitation_status?: string | null
          is_active?: boolean | null
          is_hq?: boolean | null
          last_login_at?: string | null
          onboarding_completion_pct?: number | null
          partner_id?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      _backup_user_module_permissions_v1: {
        Row: {
          access_level: string | null
          created_at: string | null
          id: string | null
          module_key: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          access_level?: string | null
          created_at?: string | null
          id?: string | null
          module_key?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          access_level?: string | null
          created_at?: string | null
          id?: string | null
          module_key?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      _backup_user_roles_v1: {
        Row: {
          id: string | null
          role: Database["public"]["Enums"]["app_role"] | null
          user_id: string | null
        }
        Insert: {
          id?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          user_id?: string | null
        }
        Update: {
          id?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          user_id?: string | null
        }
        Relationships: []
      }
      announcements: {
        Row: {
          archived_at: string | null
          audience_scope: string | null
          body: string | null
          category: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          partner_id: string | null
          pinned: boolean
          published_at: string | null
          published_by: string | null
          status: string
          summary: string | null
          target_audience: string
          target_country: string | null
          target_partnership_level: string | null
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          audience_scope?: string | null
          body?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          partner_id?: string | null
          pinned?: boolean
          published_at?: string | null
          published_by?: string | null
          status?: string
          summary?: string | null
          target_audience?: string
          target_country?: string | null
          target_partnership_level?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          audience_scope?: string | null
          body?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          partner_id?: string | null
          pinned?: boolean
          published_at?: string | null
          published_by?: string | null
          status?: string
          summary?: string | null
          target_audience?: string
          target_country?: string | null
          target_partnership_level?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_metrics"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "announcements_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_partner_summary"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action_type: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          new_value: Json | null
          notes: string | null
          old_value: Json | null
          performed_at: string | null
          performed_by: string | null
        }
        Insert: {
          action_type: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          notes?: string | null
          old_value?: Json | null
          performed_at?: string | null
          performed_by?: string | null
        }
        Update: {
          action_type?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          notes?: string | null
          old_value?: Json | null
          performed_at?: string | null
          performed_by?: string | null
        }
        Relationships: []
      }
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
          is_primary: boolean
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
          is_primary?: boolean
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
          is_primary?: boolean
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
          account_manager_id: string | null
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
          manager_owner_id: string | null
          observations: string | null
          partner_id: string | null
          partner_uuid: string | null
          phone: string | null
          postal_code: string | null
          product_type: string | null
          sector: string | null
          short_name: string | null
          source_deal_id: string | null
          source_proposal_id: string | null
          state_region: string | null
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          account_manager?: string | null
          account_manager_id?: string | null
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
          manager_owner_id?: string | null
          observations?: string | null
          partner_id?: string | null
          partner_uuid?: string | null
          phone?: string | null
          postal_code?: string | null
          product_type?: string | null
          sector?: string | null
          short_name?: string | null
          source_deal_id?: string | null
          source_proposal_id?: string | null
          state_region?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          account_manager?: string | null
          account_manager_id?: string | null
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
          manager_owner_id?: string | null
          observations?: string | null
          partner_id?: string | null
          partner_uuid?: string | null
          phone?: string | null
          postal_code?: string | null
          product_type?: string | null
          sector?: string | null
          short_name?: string | null
          source_deal_id?: string | null
          source_proposal_id?: string | null
          state_region?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_account_manager_id_fkey"
            columns: ["account_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_account_manager_id_fkey"
            columns: ["account_manager_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_sales_by_user"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clients_account_manager_id_fkey"
            columns: ["account_manager_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_sales_performance"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clients_manager_owner_id_fkey"
            columns: ["manager_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_manager_owner_id_fkey"
            columns: ["manager_owner_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_sales_by_user"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clients_manager_owner_id_fkey"
            columns: ["manager_owner_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_sales_performance"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clients_partner_uuid_fkey"
            columns: ["partner_uuid"]
            isOneToOne: false
            referencedRelation: "partner_metrics"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "clients_partner_uuid_fkey"
            columns: ["partner_uuid"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_partner_uuid_fkey"
            columns: ["partner_uuid"]
            isOneToOne: false
            referencedRelation: "v_analytics_partner_summary"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "clients_source_proposal_id_fkey"
            columns: ["source_proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "commissions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_deal_reconciliation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_ownership_status"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      community_comments: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          is_official_hq_reply: boolean
          post_id: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_official_hq_reply?: boolean
          post_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_official_hq_reply?: boolean
          post_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          answered_at: string | null
          body: string | null
          category: string
          closed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          partner_id: string | null
          pinned: boolean
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          answered_at?: string | null
          body?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          partner_id?: string | null
          pinned?: boolean
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          answered_at?: string | null
          body?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          partner_id?: string | null
          pinned?: boolean
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      contract_lines: {
        Row: {
          amount: number
          billing_frequency: string | null
          client_id: string
          contract_id: string
          created_at: string
          currency: string
          description: string
          end_date: string | null
          id: string
          line_type: string
          notes: string | null
          related_license_id: string | null
          related_module_id: string | null
          related_plugin_id: string | null
          source: string
          source_item_id: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          billing_frequency?: string | null
          client_id: string
          contract_id: string
          created_at?: string
          currency?: string
          description: string
          end_date?: string | null
          id?: string
          line_type: string
          notes?: string | null
          related_license_id?: string | null
          related_module_id?: string | null
          related_plugin_id?: string | null
          source?: string
          source_item_id?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          billing_frequency?: string | null
          client_id?: string
          contract_id?: string
          created_at?: string
          currency?: string
          description?: string
          end_date?: string | null
          id?: string
          line_type?: string
          notes?: string | null
          related_license_id?: string | null
          related_module_id?: string | null
          related_plugin_id?: string | null
          source?: string
          source_item_id?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_lines_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_lines_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_lines_related_license_id_fkey"
            columns: ["related_license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_lines_related_module_id_fkey"
            columns: ["related_module_id"]
            isOneToOne: false
            referencedRelation: "modules_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_lines_related_plugin_id_fkey"
            columns: ["related_plugin_id"]
            isOneToOne: false
            referencedRelation: "plugins_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          billing_notes: string | null
          calculated_total: number | null
          client_id: string
          contract_end_date: string | null
          contract_mode: string | null
          contract_start_date: string | null
          contract_value: number | null
          created_at: string
          currency: string | null
          hosting_value: number | null
          id: string
          invoiced_value: number | null
          is_imported: boolean
          manual_adjustment_amount: number
          mww_web_value: number | null
          notice_period_days: number | null
          num_installments: number | null
          observations: string | null
          partner_revenue_split: number | null
          price_table_reference: string | null
          renewal_freeze_notes: string | null
          renewal_increase_pct: number | null
          sat_value: number | null
          source_proposal_id: string | null
          total_value: number | null
          updated_at: string
        }
        Insert: {
          billing_notes?: string | null
          calculated_total?: number | null
          client_id: string
          contract_end_date?: string | null
          contract_mode?: string | null
          contract_start_date?: string | null
          contract_value?: number | null
          created_at?: string
          currency?: string | null
          hosting_value?: number | null
          id?: string
          invoiced_value?: number | null
          is_imported?: boolean
          manual_adjustment_amount?: number
          mww_web_value?: number | null
          notice_period_days?: number | null
          num_installments?: number | null
          observations?: string | null
          partner_revenue_split?: number | null
          price_table_reference?: string | null
          renewal_freeze_notes?: string | null
          renewal_increase_pct?: number | null
          sat_value?: number | null
          source_proposal_id?: string | null
          total_value?: number | null
          updated_at?: string
        }
        Update: {
          billing_notes?: string | null
          calculated_total?: number | null
          client_id?: string
          contract_end_date?: string | null
          contract_mode?: string | null
          contract_start_date?: string | null
          contract_value?: number | null
          created_at?: string
          currency?: string | null
          hosting_value?: number | null
          id?: string
          invoiced_value?: number | null
          is_imported?: boolean
          manual_adjustment_amount?: number
          mww_web_value?: number | null
          notice_period_days?: number | null
          num_installments?: number | null
          observations?: string | null
          partner_revenue_split?: number | null
          price_table_reference?: string | null
          renewal_freeze_notes?: string | null
          renewal_increase_pct?: number | null
          sat_value?: number | null
          source_proposal_id?: string | null
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
          {
            foreignKeyName: "contracts_source_proposal_id_fkey"
            columns: ["source_proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_activities: {
        Row: {
          activity_date: string | null
          activity_type: string
          created_at: string
          deal_id: string
          description: string | null
          id: string
          linked_proposal_id: string | null
          linked_task_id: string | null
          participants: string[] | null
          performed_by: string | null
          performed_by_user_id: string | null
          subject: string | null
          tags: string[] | null
        }
        Insert: {
          activity_date?: string | null
          activity_type?: string
          created_at?: string
          deal_id: string
          description?: string | null
          id?: string
          linked_proposal_id?: string | null
          linked_task_id?: string | null
          participants?: string[] | null
          performed_by?: string | null
          performed_by_user_id?: string | null
          subject?: string | null
          tags?: string[] | null
        }
        Update: {
          activity_date?: string | null
          activity_type?: string
          created_at?: string
          deal_id?: string
          description?: string | null
          id?: string
          linked_proposal_id?: string | null
          linked_task_id?: string | null
          participants?: string[] | null
          performed_by?: string | null
          performed_by_user_id?: string | null
          subject?: string | null
          tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_deal_reconciliation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_ownership_status"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "deal_activities_performed_by_user_id_fkey"
            columns: ["performed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_activities_performed_by_user_id_fkey"
            columns: ["performed_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_sales_by_user"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "deal_activities_performed_by_user_id_fkey"
            columns: ["performed_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_sales_performance"
            referencedColumns: ["user_id"]
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
          {
            foreignKeyName: "deal_contacts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_deal_reconciliation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_contacts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_contacts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_ownership_status"
            referencedColumns: ["deal_id"]
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
            foreignKeyName: "deal_registrations_conflict_deal_id_fkey"
            columns: ["conflict_deal_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_deal_reconciliation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_registrations_conflict_deal_id_fkey"
            columns: ["conflict_deal_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_registrations_conflict_deal_id_fkey"
            columns: ["conflict_deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_ownership_status"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "deal_registrations_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_registrations_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_deal_reconciliation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_registrations_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_registrations_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_ownership_status"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      deal_tasks: {
        Row: {
          assigned_to: string | null
          assigned_user_id: string | null
          category: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deal_id: string
          description: string | null
          due_date: string | null
          id: string
          is_completed: boolean | null
          priority: string
          status: string
          title: string
        }
        Insert: {
          assigned_to?: string | null
          assigned_user_id?: string | null
          category?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deal_id: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean | null
          priority?: string
          status?: string
          title: string
        }
        Update: {
          assigned_to?: string | null
          assigned_user_id?: string | null
          category?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean | null
          priority?: string
          status?: string
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
          {
            foreignKeyName: "deal_tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_deal_reconciliation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_ownership_status"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      deals: {
        Row: {
          aging_days: number | null
          asset_range: string | null
          assigned_salesperson: string | null
          assigned_user_id: string | null
          client_id: string | null
          company_name: string
          contact_email: string | null
          contact_person_name: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          description: string | null
          expected_close_date: string | null
          expected_value: number | null
          id: string
          industry: string | null
          job_role: string | null
          last_activity_at: string | null
          lead_source: string | null
          lost_at: string | null
          maintenance_team_size: string | null
          notes: string | null
          num_assets: number | null
          num_maintenance_team: number | null
          partner_id: string | null
          probability: number | null
          register_date: string | null
          sector: string | null
          stage: string
          stage_entered_at: string | null
          status: string
          status_changed_at: string | null
          total_value: number | null
          updated_at: string
          won_at: string | null
        }
        Insert: {
          aging_days?: number | null
          asset_range?: string | null
          assigned_salesperson?: string | null
          assigned_user_id?: string | null
          client_id?: string | null
          company_name: string
          contact_email?: string | null
          contact_person_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          expected_close_date?: string | null
          expected_value?: number | null
          id?: string
          industry?: string | null
          job_role?: string | null
          last_activity_at?: string | null
          lead_source?: string | null
          lost_at?: string | null
          maintenance_team_size?: string | null
          notes?: string | null
          num_assets?: number | null
          num_maintenance_team?: number | null
          partner_id?: string | null
          probability?: number | null
          register_date?: string | null
          sector?: string | null
          stage?: string
          stage_entered_at?: string | null
          status?: string
          status_changed_at?: string | null
          total_value?: number | null
          updated_at?: string
          won_at?: string | null
        }
        Update: {
          aging_days?: number | null
          asset_range?: string | null
          assigned_salesperson?: string | null
          assigned_user_id?: string | null
          client_id?: string | null
          company_name?: string
          contact_email?: string | null
          contact_person_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          expected_close_date?: string | null
          expected_value?: number | null
          id?: string
          industry?: string | null
          job_role?: string | null
          last_activity_at?: string | null
          lead_source?: string | null
          lost_at?: string | null
          maintenance_team_size?: string | null
          notes?: string | null
          num_assets?: number | null
          num_maintenance_team?: number | null
          partner_id?: string | null
          probability?: number | null
          register_date?: string | null
          sector?: string | null
          stage?: string
          stage_entered_at?: string | null
          status?: string
          status_changed_at?: string | null
          total_value?: number | null
          updated_at?: string
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_sales_by_user"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "deals_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_sales_performance"
            referencedColumns: ["user_id"]
          },
        ]
      }
      document_categories: {
        Row: {
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          parent_category_id: string | null
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          parent_category_id?: string | null
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          parent_category_id?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_categories_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "document_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category_id: string | null
          created_at: string | null
          description: string | null
          file_name: string | null
          file_size_bytes: number | null
          file_type: string | null
          file_url: string | null
          id: string
          is_active: boolean | null
          partner_id: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          uploaded_by: string | null
          version_number: number | null
          visibility_scope: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          partner_id?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          uploaded_by?: string | null
          version_number?: number | null
          visibility_scope?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          partner_id?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          uploaded_by?: string | null
          version_number?: number | null
          visibility_scope?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "document_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_metrics"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "documents_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_partner_summary"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      incoming_leads: {
        Row: {
          asset_range: string | null
          assigned_at: string | null
          assigned_user_id: string | null
          budget_notes: string | null
          budget_status: string | null
          company_name: string | null
          contact_name: string | null
          converted_to_deal_id: string | null
          country: string | null
          created_at: string
          current_process: string | null
          data_visibility: string | null
          decision_notes: string | null
          decision_status: string | null
          disqualified_reason: string | null
          email: string | null
          engagement_status: string | null
          existing_system: string | null
          fit_current_process_identified: boolean
          fit_decision_maker_identified: boolean
          fit_operational_maturity: boolean
          fit_pain_identified: boolean
          fit_system_dissatisfaction: boolean
          fit_urgency_identified: boolean
          id: string
          interest_notes: string | null
          interest_status: string | null
          job_role: string | null
          last_contact_at: string | null
          last_outcome: string | null
          lead_owner_type: string | null
          lead_source: string | null
          linked_partner_id: string | null
          linked_partner_name: string | null
          main_challenge: string | null
          maintenance_team_size: string | null
          notes: string | null
          nurture_reason: string | null
          nurture_until: string | null
          phone: string | null
          qualification_stage: string
          routing_reason: string | null
          sector: string | null
          sharpspring_id: string | null
          status: string
          timing_notes: string | null
          timing_status: string | null
        }
        Insert: {
          asset_range?: string | null
          assigned_at?: string | null
          assigned_user_id?: string | null
          budget_notes?: string | null
          budget_status?: string | null
          company_name?: string | null
          contact_name?: string | null
          converted_to_deal_id?: string | null
          country?: string | null
          created_at?: string
          current_process?: string | null
          data_visibility?: string | null
          decision_notes?: string | null
          decision_status?: string | null
          disqualified_reason?: string | null
          email?: string | null
          engagement_status?: string | null
          existing_system?: string | null
          fit_current_process_identified?: boolean
          fit_decision_maker_identified?: boolean
          fit_operational_maturity?: boolean
          fit_pain_identified?: boolean
          fit_system_dissatisfaction?: boolean
          fit_urgency_identified?: boolean
          id?: string
          interest_notes?: string | null
          interest_status?: string | null
          job_role?: string | null
          last_contact_at?: string | null
          last_outcome?: string | null
          lead_owner_type?: string | null
          lead_source?: string | null
          linked_partner_id?: string | null
          linked_partner_name?: string | null
          main_challenge?: string | null
          maintenance_team_size?: string | null
          notes?: string | null
          nurture_reason?: string | null
          nurture_until?: string | null
          phone?: string | null
          qualification_stage?: string
          routing_reason?: string | null
          sector?: string | null
          sharpspring_id?: string | null
          status?: string
          timing_notes?: string | null
          timing_status?: string | null
        }
        Update: {
          asset_range?: string | null
          assigned_at?: string | null
          assigned_user_id?: string | null
          budget_notes?: string | null
          budget_status?: string | null
          company_name?: string | null
          contact_name?: string | null
          converted_to_deal_id?: string | null
          country?: string | null
          created_at?: string
          current_process?: string | null
          data_visibility?: string | null
          decision_notes?: string | null
          decision_status?: string | null
          disqualified_reason?: string | null
          email?: string | null
          engagement_status?: string | null
          existing_system?: string | null
          fit_current_process_identified?: boolean
          fit_decision_maker_identified?: boolean
          fit_operational_maturity?: boolean
          fit_pain_identified?: boolean
          fit_system_dissatisfaction?: boolean
          fit_urgency_identified?: boolean
          id?: string
          interest_notes?: string | null
          interest_status?: string | null
          job_role?: string | null
          last_contact_at?: string | null
          last_outcome?: string | null
          lead_owner_type?: string | null
          lead_source?: string | null
          linked_partner_id?: string | null
          linked_partner_name?: string | null
          main_challenge?: string | null
          maintenance_team_size?: string | null
          notes?: string | null
          nurture_reason?: string | null
          nurture_until?: string | null
          phone?: string | null
          qualification_stage?: string
          routing_reason?: string | null
          sector?: string | null
          sharpspring_id?: string | null
          status?: string
          timing_notes?: string | null
          timing_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incoming_leads_converted_to_deal_id_fkey"
            columns: ["converted_to_deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_leads_converted_to_deal_id_fkey"
            columns: ["converted_to_deal_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_deal_reconciliation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_leads_converted_to_deal_id_fkey"
            columns: ["converted_to_deal_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_leads_converted_to_deal_id_fkey"
            columns: ["converted_to_deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_ownership_status"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "incoming_leads_linked_partner_id_fkey"
            columns: ["linked_partner_id"]
            isOneToOne: false
            referencedRelation: "partner_metrics"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "incoming_leads_linked_partner_id_fkey"
            columns: ["linked_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_leads_linked_partner_id_fkey"
            columns: ["linked_partner_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_partner_summary"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      lead_contact_attempts: {
        Row: {
          channel: string
          created_at: string
          id: string
          lead_id: string
          notes: string | null
          outcome: string
          performed_at: string
          performed_by: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          lead_id: string
          notes?: string | null
          outcome: string
          performed_at?: string
          performed_by?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          lead_id?: string
          notes?: string | null
          outcome?: string
          performed_at?: string
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_contact_attempts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "incoming_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tasks: {
        Row: {
          assigned_user_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          lead_id: string
          priority: string
          status: string
          title: string
        }
        Insert: {
          assigned_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id: string
          priority?: string
          status?: string
          title: string
        }
        Update: {
          assigned_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string
          priority?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "incoming_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      licensed_modules: {
        Row: {
          created_at: string
          enabled: boolean
          end_date: string | null
          id: string
          included_in_base: boolean
          item_type: string | null
          license_id: string
          license_type: string | null
          module_id: string | null
          module_name: string
          notes: string | null
          periodicity: string | null
          plugin_id: string | null
          quantity: number
          start_date: string | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          end_date?: string | null
          id?: string
          included_in_base?: boolean
          item_type?: string | null
          license_id: string
          license_type?: string | null
          module_id?: string | null
          module_name: string
          notes?: string | null
          periodicity?: string | null
          plugin_id?: string | null
          quantity?: number
          start_date?: string | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          end_date?: string | null
          id?: string
          included_in_base?: boolean
          item_type?: string | null
          license_id?: string
          license_type?: string | null
          module_id?: string | null
          module_name?: string
          notes?: string | null
          periodicity?: string | null
          plugin_id?: string | null
          quantity?: number
          start_date?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "licensed_modules_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensed_modules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensed_modules_plugin_id_fkey"
            columns: ["plugin_id"]
            isOneToOne: false
            referencedRelation: "plugins_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      licenses: {
        Row: {
          api_access: boolean
          backoffice_employee_users: number | null
          backoffice_users: number | null
          billing_frequency: string | null
          client_id: string
          contract_id: string | null
          contract_value: number | null
          created_at: string
          currency: string
          database_type: string | null
          deal_id: string | null
          deployment_type: string | null
          edition: string | null
          environment: string | null
          id: string
          initial_contract_value: number | null
          is_draft: boolean
          lic_code: string | null
          lic_serial: string | null
          license_end_date: string | null
          license_model: string | null
          license_start_date: string | null
          license_status: string
          mobile_users: number | null
          notes: string | null
          num_users: number | null
          periodicity: string | null
          previous_license_id: string | null
          product: string | null
          proposal_id: string | null
          recurring_contract_value: number | null
          replaced_by_license_id: string | null
          sat_active: boolean
          sat_end_date: string | null
          sat_start_date: string | null
          source_proposal_id: string | null
          updated_at: string
          version: string | null
          web_accesses: number | null
        }
        Insert: {
          api_access?: boolean
          backoffice_employee_users?: number | null
          backoffice_users?: number | null
          billing_frequency?: string | null
          client_id: string
          contract_id?: string | null
          contract_value?: number | null
          created_at?: string
          currency?: string
          database_type?: string | null
          deal_id?: string | null
          deployment_type?: string | null
          edition?: string | null
          environment?: string | null
          id?: string
          initial_contract_value?: number | null
          is_draft?: boolean
          lic_code?: string | null
          lic_serial?: string | null
          license_end_date?: string | null
          license_model?: string | null
          license_start_date?: string | null
          license_status?: string
          mobile_users?: number | null
          notes?: string | null
          num_users?: number | null
          periodicity?: string | null
          previous_license_id?: string | null
          product?: string | null
          proposal_id?: string | null
          recurring_contract_value?: number | null
          replaced_by_license_id?: string | null
          sat_active?: boolean
          sat_end_date?: string | null
          sat_start_date?: string | null
          source_proposal_id?: string | null
          updated_at?: string
          version?: string | null
          web_accesses?: number | null
        }
        Update: {
          api_access?: boolean
          backoffice_employee_users?: number | null
          backoffice_users?: number | null
          billing_frequency?: string | null
          client_id?: string
          contract_id?: string | null
          contract_value?: number | null
          created_at?: string
          currency?: string
          database_type?: string | null
          deal_id?: string | null
          deployment_type?: string | null
          edition?: string | null
          environment?: string | null
          id?: string
          initial_contract_value?: number | null
          is_draft?: boolean
          lic_code?: string | null
          lic_serial?: string | null
          license_end_date?: string | null
          license_model?: string | null
          license_start_date?: string | null
          license_status?: string
          mobile_users?: number | null
          notes?: string | null
          num_users?: number | null
          periodicity?: string | null
          previous_license_id?: string | null
          product?: string | null
          proposal_id?: string | null
          recurring_contract_value?: number | null
          replaced_by_license_id?: string | null
          sat_active?: boolean
          sat_end_date?: string | null
          sat_start_date?: string | null
          source_proposal_id?: string | null
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
          {
            foreignKeyName: "licenses_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licenses_previous_license_id_fkey"
            columns: ["previous_license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licenses_replaced_by_license_id_fkey"
            columns: ["replaced_by_license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      lifecycle_events: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          client_id: string | null
          created_at: string
          event_description: string | null
          event_title: string
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          source_contract_id: string | null
          source_license_id: string | null
          source_proposal_id: string | null
          source_proposal_number: string | null
          source_renewal_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          client_id?: string | null
          created_at?: string
          event_description?: string | null
          event_title: string
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          source_contract_id?: string | null
          source_license_id?: string | null
          source_proposal_id?: string | null
          source_proposal_number?: string | null
          source_renewal_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          client_id?: string | null
          created_at?: string
          event_description?: string | null
          event_title?: string
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          source_contract_id?: string | null
          source_license_id?: string | null
          source_proposal_id?: string | null
          source_proposal_number?: string | null
          source_renewal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lifecycle_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifecycle_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_sales_by_user"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "lifecycle_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_sales_performance"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "lifecycle_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifecycle_events_source_contract_id_fkey"
            columns: ["source_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifecycle_events_source_license_id_fkey"
            columns: ["source_license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifecycle_events_source_proposal_id_fkey"
            columns: ["source_proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifecycle_events_source_renewal_id_fkey"
            columns: ["source_renewal_id"]
            isOneToOne: false
            referencedRelation: "renewals"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          owner_user_id: string | null
          priority: string
          related_company: string | null
          related_entity_id: string | null
          related_route: string | null
          related_source: string | null
          related_type: string
          status: string
          task_status: string
          task_type: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          owner_user_id?: string | null
          priority?: string
          related_company?: string | null
          related_entity_id?: string | null
          related_route?: string | null
          related_source?: string | null
          related_type?: string
          status?: string
          task_status?: string
          task_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          owner_user_id?: string | null
          priority?: string
          related_company?: string | null
          related_entity_id?: string | null
          related_route?: string | null
          related_source?: string | null
          related_type?: string
          status?: string
          task_status?: string
          task_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_analytics_sales_by_user"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "manual_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_analytics_sales_performance"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "manual_tasks_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_tasks_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_sales_by_user"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "manual_tasks_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_sales_performance"
            referencedColumns: ["user_id"]
          },
        ]
      }
      modules_catalog: {
        Row: {
          category: string | null
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          category?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          category?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
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
      onboarding_checklist: {
        Row: {
          category: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          is_completed: boolean
          onboarding_id: string
          sort_order: number
          task_name: string
        }
        Insert: {
          category?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean
          onboarding_id: string
          sort_order?: number
          task_name: string
        }
        Update: {
          category?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean
          onboarding_id?: string
          sort_order?: number
          task_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_checklist_onboarding_id_fkey"
            columns: ["onboarding_id"]
            isOneToOne: false
            referencedRelation: "partner_onboarding"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_loss_details: {
        Row: {
          competitor_name: string | null
          competitor_other: string | null
          created_at: string
          deal_id: string
          id: string
          loss_category: string
          lost_at: string
          lost_by: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          competitor_name?: string | null
          competitor_other?: string | null
          created_at?: string
          deal_id: string
          id?: string
          loss_category: string
          lost_at?: string
          lost_by?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          competitor_name?: string | null
          competitor_other?: string | null
          created_at?: string
          deal_id?: string
          id?: string
          loss_category?: string
          lost_at?: string
          lost_by?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      opportunity_loss_reasons: {
        Row: {
          created_at: string
          id: string
          loss_detail_id: string
          reason: string
        }
        Insert: {
          created_at?: string
          id?: string
          loss_detail_id: string
          reason: string
        }
        Update: {
          created_at?: string
          id?: string
          loss_detail_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_loss_reasons_loss_detail_id_fkey"
            columns: ["loss_detail_id"]
            isOneToOne: false
            referencedRelation: "opportunity_loss_details"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_badges: {
        Row: {
          awarded_at: string
          badge_description: string | null
          badge_icon: string | null
          badge_name: string
          id: string
          partner_id: string
        }
        Insert: {
          awarded_at?: string
          badge_description?: string | null
          badge_icon?: string | null
          badge_name: string
          id?: string
          partner_id: string
        }
        Update: {
          awarded_at?: string
          badge_description?: string | null
          badge_icon?: string | null
          badge_name?: string
          id?: string
          partner_id?: string
        }
        Relationships: []
      }
      partner_certifications: {
        Row: {
          awarded_at: string | null
          certification_level: number
          certification_name: string
          certification_type: string | null
          created_at: string
          expires_at: string | null
          expiry_date: string | null
          file_url: string | null
          id: string
          issue_date: string | null
          partner_id: string
          score: number | null
          status: string
          user_email: string | null
          user_name: string
        }
        Insert: {
          awarded_at?: string | null
          certification_level?: number
          certification_name: string
          certification_type?: string | null
          created_at?: string
          expires_at?: string | null
          expiry_date?: string | null
          file_url?: string | null
          id?: string
          issue_date?: string | null
          partner_id: string
          score?: number | null
          status?: string
          user_email?: string | null
          user_name: string
        }
        Update: {
          awarded_at?: string | null
          certification_level?: number
          certification_name?: string
          certification_type?: string | null
          created_at?: string
          expires_at?: string | null
          expiry_date?: string | null
          file_url?: string | null
          id?: string
          issue_date?: string | null
          partner_id?: string
          score?: number | null
          status?: string
          user_email?: string | null
          user_name?: string
        }
        Relationships: []
      }
      partner_health_scores: {
        Row: {
          activity_score: number | null
          calculated_at: string
          certification_score: number | null
          conversion_score: number | null
          id: string
          overall_score: number
          partner_id: string
          pipeline_score: number | null
          renewal_score: number | null
          revenue_score: number | null
          risk_level: string | null
          trend: string | null
        }
        Insert: {
          activity_score?: number | null
          calculated_at?: string
          certification_score?: number | null
          conversion_score?: number | null
          id?: string
          overall_score?: number
          partner_id: string
          pipeline_score?: number | null
          renewal_score?: number | null
          revenue_score?: number | null
          risk_level?: string | null
          trend?: string | null
        }
        Update: {
          activity_score?: number | null
          calculated_at?: string
          certification_score?: number | null
          conversion_score?: number | null
          id?: string
          overall_score?: number
          partner_id?: string
          pipeline_score?: number | null
          renewal_score?: number | null
          revenue_score?: number | null
          risk_level?: string | null
          trend?: string | null
        }
        Relationships: []
      }
      partner_missions: {
        Row: {
          completed_at: string | null
          created_at: string
          current_value: number
          ends_at: string | null
          id: string
          mission_description: string | null
          mission_name: string
          mission_type: string | null
          partner_id: string
          starts_at: string | null
          status: string
          target_value: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_value?: number
          ends_at?: string | null
          id?: string
          mission_description?: string | null
          mission_name: string
          mission_type?: string | null
          partner_id: string
          starts_at?: string | null
          status?: string
          target_value?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_value?: number
          ends_at?: string | null
          id?: string
          mission_description?: string | null
          mission_name?: string
          mission_type?: string | null
          partner_id?: string
          starts_at?: string | null
          status?: string
          target_value?: number
        }
        Relationships: []
      }
      partner_notes: {
        Row: {
          action_items: Json
          author_id: string | null
          author_name: string | null
          content: string
          created_at: string
          decisions: Json
          extra: Json
          id: string
          interaction_date: string
          interaction_type: string
          next_actions: string | null
          note_type: string
          participants: Json
          partner_id: string
          risks: Json
          topics: Json
        }
        Insert: {
          action_items?: Json
          author_id?: string | null
          author_name?: string | null
          content: string
          created_at?: string
          decisions?: Json
          extra?: Json
          id?: string
          interaction_date?: string
          interaction_type?: string
          next_actions?: string | null
          note_type?: string
          participants?: Json
          partner_id: string
          risks?: Json
          topics?: Json
        }
        Update: {
          action_items?: Json
          author_id?: string | null
          author_name?: string | null
          content?: string
          created_at?: string
          decisions?: Json
          extra?: Json
          id?: string
          interaction_date?: string
          interaction_type?: string
          next_actions?: string | null
          note_type?: string
          participants?: Json
          partner_id?: string
          risks?: Json
          topics?: Json
        }
        Relationships: [
          {
            foreignKeyName: "partner_notes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_metrics"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_notes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_notes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_partner_summary"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      partner_onboarding: {
        Row: {
          assigned_manager: string | null
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          partner_id: string
          progress_pct: number
          stage: string
          started_at: string | null
          updated_at: string
        }
        Insert: {
          assigned_manager?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          partner_id: string
          progress_pct?: number
          stage?: string
          started_at?: string | null
          updated_at?: string
        }
        Update: {
          assigned_manager?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          partner_id?: string
          progress_pct?: number
          stage?: string
          started_at?: string | null
          updated_at?: string
        }
        Relationships: []
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
      partner_tiers: {
        Row: {
          annual_revenue: number | null
          auto_suggested_tier: number | null
          certified_users: number | null
          created_at: string
          current_tier: number
          downgraded_at: string | null
          hq_validated: boolean | null
          id: string
          partner_id: string
          previous_tier: number | null
          tier_name: string
          total_deals: number | null
          updated_at: string
          upgraded_at: string | null
          win_rate: number | null
        }
        Insert: {
          annual_revenue?: number | null
          auto_suggested_tier?: number | null
          certified_users?: number | null
          created_at?: string
          current_tier?: number
          downgraded_at?: string | null
          hq_validated?: boolean | null
          id?: string
          partner_id: string
          previous_tier?: number | null
          tier_name?: string
          total_deals?: number | null
          updated_at?: string
          upgraded_at?: string | null
          win_rate?: number | null
        }
        Update: {
          annual_revenue?: number | null
          auto_suggested_tier?: number | null
          certified_users?: number | null
          created_at?: string
          current_tier?: number
          downgraded_at?: string | null
          hq_validated?: boolean | null
          id?: string
          partner_id?: string
          previous_tier?: number | null
          tier_name?: string
          total_deals?: number | null
          updated_at?: string
          upgraded_at?: string | null
          win_rate?: number | null
        }
        Relationships: []
      }
      partners: {
        Row: {
          account_owner_id: string | null
          alert_notice_days: number | null
          assigned_manager_id: string | null
          company_name: string
          country: string | null
          created_at: string | null
          created_by: string | null
          health_score: number | null
          id: string
          is_active: boolean | null
          last_meeting_date: string | null
          legal_name: string | null
          meeting_cadence: string | null
          next_meeting_date: string | null
          notes: string | null
          number_of_clients: number | null
          onboarding_status: string | null
          partner_code: string
          partner_type: string | null
          partnership_level: string | null
          phone: string | null
          pipeline_value: number | null
          primary_contact_email: string | null
          primary_contact_name: string | null
          region: string | null
          relationship_status: string | null
          revenue_ytd: number | null
          start_date: string | null
          status: string | null
          tier_id: number | null
          total_revenue: number | null
          updated_at: string | null
          updated_by: string | null
          uses_manwinwin_database: boolean | null
          uses_own_database: boolean | null
          website: string | null
        }
        Insert: {
          account_owner_id?: string | null
          alert_notice_days?: number | null
          assigned_manager_id?: string | null
          company_name: string
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          health_score?: number | null
          id?: string
          is_active?: boolean | null
          last_meeting_date?: string | null
          legal_name?: string | null
          meeting_cadence?: string | null
          next_meeting_date?: string | null
          notes?: string | null
          number_of_clients?: number | null
          onboarding_status?: string | null
          partner_code: string
          partner_type?: string | null
          partnership_level?: string | null
          phone?: string | null
          pipeline_value?: number | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          region?: string | null
          relationship_status?: string | null
          revenue_ytd?: number | null
          start_date?: string | null
          status?: string | null
          tier_id?: number | null
          total_revenue?: number | null
          updated_at?: string | null
          updated_by?: string | null
          uses_manwinwin_database?: boolean | null
          uses_own_database?: boolean | null
          website?: string | null
        }
        Update: {
          account_owner_id?: string | null
          alert_notice_days?: number | null
          assigned_manager_id?: string | null
          company_name?: string
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          health_score?: number | null
          id?: string
          is_active?: boolean | null
          last_meeting_date?: string | null
          legal_name?: string | null
          meeting_cadence?: string | null
          next_meeting_date?: string | null
          notes?: string | null
          number_of_clients?: number | null
          onboarding_status?: string | null
          partner_code?: string
          partner_type?: string | null
          partnership_level?: string | null
          phone?: string | null
          pipeline_value?: number | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          region?: string | null
          relationship_status?: string | null
          revenue_ytd?: number | null
          start_date?: string | null
          status?: string | null
          tier_id?: number | null
          total_revenue?: number | null
          updated_at?: string | null
          updated_by?: string | null
          uses_manwinwin_database?: boolean | null
          uses_own_database?: boolean | null
          website?: string | null
        }
        Relationships: []
      }
      partnership_levels: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
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
      plugins_catalog: {
        Row: {
          category: string | null
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          category?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          category?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      pricing_rules: {
        Row: {
          active: boolean
          applicable_plan: string | null
          applies_to_license_total: boolean
          billing_frequency: string | null
          can_override: boolean
          category: string
          code: string
          created_at: string
          currency: string
          description: string | null
          id: string
          included_by_default: boolean
          label: string
          license_model: string | null
          notes: string | null
          optional: boolean
          product_family: string
          region: string
          sort_order: number
          support_calculation_type: string | null
          support_percentage: number | null
          unit_price: number
          unit_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          applicable_plan?: string | null
          applies_to_license_total?: boolean
          billing_frequency?: string | null
          can_override?: boolean
          category?: string
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          included_by_default?: boolean
          label: string
          license_model?: string | null
          notes?: string | null
          optional?: boolean
          product_family?: string
          region?: string
          sort_order?: number
          support_calculation_type?: string | null
          support_percentage?: number | null
          unit_price?: number
          unit_type?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          applicable_plan?: string | null
          applies_to_license_total?: boolean
          billing_frequency?: string | null
          can_override?: boolean
          category?: string
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          included_by_default?: boolean
          label?: string
          license_model?: string | null
          notes?: string | null
          optional?: boolean
          product_family?: string
          region?: string
          sort_order?: number
          support_calculation_type?: string | null
          support_percentage?: number | null
          unit_price?: number
          unit_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          certification_level: number | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          invitation_accepted_at: string | null
          invitation_sent_at: string | null
          invitation_status: string | null
          is_active: boolean | null
          is_hq: boolean | null
          last_login_at: string | null
          onboarding_completion_pct: number | null
          partner_id: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          certification_level?: number | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          invitation_accepted_at?: string | null
          invitation_sent_at?: string | null
          invitation_status?: string | null
          is_active?: boolean | null
          is_hq?: boolean | null
          last_login_at?: string | null
          onboarding_completion_pct?: number | null
          partner_id?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          certification_level?: number | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          invitation_accepted_at?: string | null
          invitation_sent_at?: string | null
          invitation_status?: string | null
          is_active?: boolean | null
          is_hq?: boolean | null
          last_login_at?: string | null
          onboarding_completion_pct?: number | null
          partner_id?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_metrics"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "profiles_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_partner_summary"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      proposal_items: {
        Row: {
          apply_discount_to_renewal: boolean
          category: string
          created_at: string
          description: string | null
          discount_amount: number
          discount_type: string
          discount_value: number
          frequency: string
          gross_total: number
          id: string
          is_override: boolean
          is_recurring: boolean
          item_code: string | null
          item_name: string
          net_total: number
          proposal_id: string
          qty: number
          sort_order: number
          total: number
          unit_price: number
        }
        Insert: {
          apply_discount_to_renewal?: boolean
          category?: string
          created_at?: string
          description?: string | null
          discount_amount?: number
          discount_type?: string
          discount_value?: number
          frequency?: string
          gross_total?: number
          id?: string
          is_override?: boolean
          is_recurring?: boolean
          item_code?: string | null
          item_name: string
          net_total?: number
          proposal_id: string
          qty?: number
          sort_order?: number
          total?: number
          unit_price?: number
        }
        Update: {
          apply_discount_to_renewal?: boolean
          category?: string
          created_at?: string
          description?: string | null
          discount_amount?: number
          discount_type?: string
          discount_value?: number
          frequency?: string
          gross_total?: number
          id?: string
          is_override?: boolean
          is_recurring?: boolean
          item_code?: string | null
          item_name?: string
          net_total?: number
          proposal_id?: string
          qty?: number
          sort_order?: number
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_items_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_templates: {
        Row: {
          active: boolean
          created_at: string
          id: string
          language: string
          notes_template: string | null
          payment_terms: string | null
          template_file: string | null
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          language?: string
          notes_template?: string | null
          payment_terms?: string | null
          template_file?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          language?: string
          notes_template?: string | null
          payment_terms?: string | null
          template_file?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      proposals: {
        Row: {
          backoffice_work_hours: number | null
          business_config: Json | null
          client_name: string
          country: string | null
          created_at: string
          created_by: string | null
          deployment: string | null
          discount_amount: number | null
          discount_pct: number | null
          discount_scope: string
          docx_url: string | null
          generated_at: string | null
          hosting: string
          id: string
          implementation_type: string | null
          include_requests_module: boolean
          language: string
          lead_id: string
          license_model: string | null
          notes: string | null
          parent_proposal_id: string | null
          payment_terms: string | null
          pdf_url: string | null
          per_diem: number | null
          plan: number
          product_family: string
          project_name: string | null
          proposal_date: string
          proposal_mode: string | null
          service_days: number | null
          service_hours: number | null
          services_discount_pct: number
          services_subtotal: number | null
          software_discount_pct: number
          software_subtotal: number | null
          status: string
          total_recurring: number | null
          total_year_1: number | null
          updated_at: string
          validity_days: number
          version: number
          web_users: number
        }
        Insert: {
          backoffice_work_hours?: number | null
          business_config?: Json | null
          client_name: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          deployment?: string | null
          discount_amount?: number | null
          discount_pct?: number | null
          discount_scope?: string
          docx_url?: string | null
          generated_at?: string | null
          hosting?: string
          id?: string
          implementation_type?: string | null
          include_requests_module?: boolean
          language?: string
          lead_id: string
          license_model?: string | null
          notes?: string | null
          parent_proposal_id?: string | null
          payment_terms?: string | null
          pdf_url?: string | null
          per_diem?: number | null
          plan?: number
          product_family?: string
          project_name?: string | null
          proposal_date?: string
          proposal_mode?: string | null
          service_days?: number | null
          service_hours?: number | null
          services_discount_pct?: number
          services_subtotal?: number | null
          software_discount_pct?: number
          software_subtotal?: number | null
          status?: string
          total_recurring?: number | null
          total_year_1?: number | null
          updated_at?: string
          validity_days?: number
          version?: number
          web_users?: number
        }
        Update: {
          backoffice_work_hours?: number | null
          business_config?: Json | null
          client_name?: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          deployment?: string | null
          discount_amount?: number | null
          discount_pct?: number | null
          discount_scope?: string
          docx_url?: string | null
          generated_at?: string | null
          hosting?: string
          id?: string
          implementation_type?: string | null
          include_requests_module?: boolean
          language?: string
          lead_id?: string
          license_model?: string | null
          notes?: string | null
          parent_proposal_id?: string | null
          payment_terms?: string | null
          pdf_url?: string | null
          per_diem?: number | null
          plan?: number
          product_family?: string
          project_name?: string | null
          proposal_date?: string
          proposal_mode?: string | null
          service_days?: number | null
          service_hours?: number | null
          services_discount_pct?: number
          services_subtotal?: number | null
          software_discount_pct?: number
          software_subtotal?: number | null
          status?: string
          total_recurring?: number | null
          total_year_1?: number | null
          updated_at?: string
          validity_days?: number
          version?: number
          web_users?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposals_parent_proposal_id_fkey"
            columns: ["parent_proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
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
          assigned_user_id: string | null
          billing_frequency: string | null
          client_id: string
          contract_id: string | null
          covered_by_contract_id: string | null
          created_at: string
          estimated_value: number | null
          final_value: number | null
          id: string
          is_covered_by_contract: boolean
          last_interaction: string | null
          license_id: string | null
          notes: string | null
          notice_period_days: number | null
          partner_id: string | null
          partner_uuid: string | null
          priority: string | null
          renewal_date: string | null
          renewal_type: string
          source_proposal_id: string | null
          status: string
          target_id: string | null
          target_type: string | null
          updated_at: string
        }
        Insert: {
          alert_window_days?: number | null
          assigned_owner?: string | null
          assigned_user_id?: string | null
          billing_frequency?: string | null
          client_id: string
          contract_id?: string | null
          covered_by_contract_id?: string | null
          created_at?: string
          estimated_value?: number | null
          final_value?: number | null
          id?: string
          is_covered_by_contract?: boolean
          last_interaction?: string | null
          license_id?: string | null
          notes?: string | null
          notice_period_days?: number | null
          partner_id?: string | null
          partner_uuid?: string | null
          priority?: string | null
          renewal_date?: string | null
          renewal_type?: string
          source_proposal_id?: string | null
          status?: string
          target_id?: string | null
          target_type?: string | null
          updated_at?: string
        }
        Update: {
          alert_window_days?: number | null
          assigned_owner?: string | null
          assigned_user_id?: string | null
          billing_frequency?: string | null
          client_id?: string
          contract_id?: string | null
          covered_by_contract_id?: string | null
          created_at?: string
          estimated_value?: number | null
          final_value?: number | null
          id?: string
          is_covered_by_contract?: boolean
          last_interaction?: string | null
          license_id?: string | null
          notes?: string | null
          notice_period_days?: number | null
          partner_id?: string | null
          partner_uuid?: string | null
          priority?: string | null
          renewal_date?: string | null
          renewal_type?: string
          source_proposal_id?: string | null
          status?: string
          target_id?: string | null
          target_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "renewals_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewals_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_sales_by_user"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "renewals_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_sales_performance"
            referencedColumns: ["user_id"]
          },
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
            foreignKeyName: "renewals_covered_by_contract_id_fkey"
            columns: ["covered_by_contract_id"]
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
          {
            foreignKeyName: "renewals_partner_uuid_fkey"
            columns: ["partner_uuid"]
            isOneToOne: false
            referencedRelation: "partner_metrics"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "renewals_partner_uuid_fkey"
            columns: ["partner_uuid"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewals_partner_uuid_fkey"
            columns: ["partner_uuid"]
            isOneToOne: false
            referencedRelation: "v_analytics_partner_summary"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      role_permission_templates: {
        Row: {
          access_level: string
          id: string
          module_key: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          access_level?: string
          id?: string
          module_key: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          access_level?: string
          id?: string
          module_key?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      training_courses: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          estimated_duration_minutes: number | null
          id: string
          is_active: boolean | null
          required_for_tier: number | null
          sort_order: number | null
          thumbnail_url: string | null
          title: string
          updated_at: string | null
          visibility_scope: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          required_for_tier?: number | null
          sort_order?: number | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string | null
          visibility_scope?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          required_for_tier?: number | null
          sort_order?: number | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string | null
          visibility_scope?: string | null
        }
        Relationships: []
      }
      training_modules: {
        Row: {
          content_type: string | null
          content_url: string | null
          course_id: string
          created_at: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          order_index: number | null
          quiz_required: boolean | null
          title: string
        }
        Insert: {
          content_type?: string | null
          content_url?: string | null
          course_id: string
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          order_index?: number | null
          quiz_required?: boolean | null
          title: string
        }
        Update: {
          content_type?: string | null
          content_url?: string | null
          course_id?: string
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          order_index?: number | null
          quiz_required?: boolean | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      training_progress: {
        Row: {
          completed_at: string | null
          course_id: string
          created_at: string | null
          id: string
          is_completed: boolean | null
          module_id: string | null
          progress_pct: number | null
          score: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          course_id: string
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          module_id?: string | null
          progress_pct?: number | null
          score?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          course_id?: string
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          module_id?: string | null
          progress_pct?: number | null
          score?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_progress_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_progress_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "training_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      user_module_permissions: {
        Row: {
          access_level: string
          created_at: string
          id: string
          is_override: boolean
          module_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_level?: string
          created_at?: string
          id?: string
          is_override?: boolean
          module_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_level?: string
          created_at?: string
          id?: string
          is_override?: boolean
          module_key?: string
          updated_at?: string
          user_id?: string
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
      client_commercial_intelligence: {
        Row: {
          active_contract_count: number | null
          active_license_count: number | null
          active_modules: Json | null
          active_plugins: Json | null
          active_renewal_count: number | null
          api_access: boolean | null
          backoffice_users: number | null
          client_id: string | null
          client_name: string | null
          commercial_score: number | null
          confidence: string | null
          country: string | null
          days_to_renewal: number | null
          deployment_type: string | null
          expansion_potential: number | null
          has_active_renewal: boolean | null
          has_contract: boolean | null
          has_license: boolean | null
          high_confidence_potential: number | null
          license_family: string | null
          license_variant: string | null
          low_confidence_potential: number | null
          medium_confidence_potential: number | null
          missing_modules: Json | null
          missing_plugins: Json | null
          next_renewal_date: string | null
          next_renewal_value: number | null
          not_renewed_items: Json | null
          one_time_items: Json | null
          one_time_value: number | null
          partner_id: string | null
          partner_name: string | null
          proposed_not_purchased: Json | null
          recommended_actions: Json | null
          recurring_arr: number | null
          recurring_items: Json | null
          renewal_risk: string | null
          risk_signals: Json | null
          sat_active: boolean | null
          sector: string | null
          updated_at: string | null
          upsell_opportunities: Json | null
          web_users: number | null
          year1_value: number | null
        }
        Relationships: []
      }
      partner_metrics: {
        Row: {
          clients: number | null
          engagement_score: number | null
          factors: Json | null
          health_score: number | null
          maturity: string | null
          momentum_score: number | null
          negative_factors: string[] | null
          partner_id: string | null
          pipeline: number | null
          positive_factors: string[] | null
          relationship_score: number | null
          revenue: number | null
        }
        Relationships: []
      }
      unified_tasks: {
        Row: {
          company_name: string | null
          completed_at: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string | null
          is_auto: boolean | null
          owner_email: string | null
          owner_name: string | null
          owner_user_id: string | null
          priority: string | null
          priority_score: number | null
          related_entity_id: string | null
          related_route: string | null
          revenue_impact: number | null
          source: string | null
          source_id: string | null
          status: string | null
          task_type: string | null
          title: string | null
        }
        Relationships: []
      }
      v_analytics_deal_reconciliation: {
        Row: {
          assigned_user_id: string | null
          authoritative_value: number | null
          company_name: string | null
          country_normalized: string | null
          country_raw: string | null
          created_at: string | null
          deal_probability: number | null
          expected_value: number | null
          id: string | null
          in_pipeline: boolean | null
          in_revenue: boolean | null
          lost_at: string | null
          owner_display_name: string | null
          ownership_status: string | null
          partner_id: string | null
          resolved_probability: number | null
          salesperson: string | null
          stage: string | null
          status: string | null
          status_changed_at: string | null
          total_value: number | null
          updated_at: string | null
          weighted_value: number | null
          won_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_sales_by_user"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "deals_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_sales_performance"
            referencedColumns: ["user_id"]
          },
        ]
      }
      v_analytics_outcomes: {
        Row: {
          closed_at: string | null
          id: string | null
          partner_id: string | null
          status: string | null
          value: number | null
        }
        Insert: {
          closed_at?: never
          id?: string | null
          partner_id?: string | null
          status?: string | null
          value?: never
        }
        Update: {
          closed_at?: never
          id?: string | null
          partner_id?: string | null
          status?: string | null
          value?: never
        }
        Relationships: []
      }
      v_analytics_partner_summary: {
        Row: {
          client_count: number | null
          company_name: string | null
          country: string | null
          open_deal_count: number | null
          partner_id: string | null
          pipeline: number | null
          revenue: number | null
          won_deal_count: number | null
        }
        Relationships: []
      }
      v_analytics_pipeline_monthly: {
        Row: {
          month_key: string | null
          month_label: string | null
          open_deal_count: number | null
          pipeline_value: number | null
        }
        Relationships: []
      }
      v_analytics_pipeline_stage: {
        Row: {
          deal_count: number | null
          stage: string | null
          total_value: number | null
          weighted_value: number | null
        }
        Relationships: []
      }
      v_analytics_pipeline_summary: {
        Row: {
          avg_deal_size: number | null
          open_deals: number | null
          pipeline_value: number | null
          weighted_pipeline: number | null
          win_rate: number | null
        }
        Relationships: []
      }
      v_analytics_renewals_summary: {
        Row: {
          lost: number | null
          overdue: number | null
          success_rate: number | null
          total: number | null
          upcoming: number | null
          won: number | null
          won_value: number | null
        }
        Relationships: []
      }
      v_analytics_revenue_by_country: {
        Row: {
          country: string | null
          revenue: number | null
          won_deal_count: number | null
        }
        Relationships: []
      }
      v_analytics_revenue_monthly: {
        Row: {
          month_key: string | null
          month_label: string | null
          revenue: number | null
          won_deal_count: number | null
        }
        Relationships: []
      }
      v_analytics_sales_by_user: {
        Row: {
          is_active: boolean | null
          lost_count: number | null
          open_count: number | null
          partner_id: string | null
          pipeline_value: number | null
          user_email: string | null
          user_full_name: string | null
          user_id: string | null
          weighted_pipeline: number | null
          won_count: number | null
          won_revenue: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_metrics"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "profiles_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_partner_summary"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      v_analytics_sales_performance: {
        Row: {
          is_unlinked: boolean | null
          lost_count: number | null
          open_count: number | null
          pipeline_value: number | null
          sales_key: string | null
          sales_name: string | null
          user_id: string | null
          weighted_pipeline: number | null
          won_count: number | null
          won_revenue: number | null
        }
        Relationships: []
      }
      v_deal_ownership_status: {
        Row: {
          assigned_user_id: string | null
          deal_id: string | null
          owner_display_name: string | null
          ownership_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_sales_by_user"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "deals_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "v_analytics_sales_performance"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Functions: {
      access_level_rank: { Args: { _lvl: string }; Returns: number }
      active_hq_admin_count: { Args: never; Returns: number }
      apply_role_template_to_user: {
        Args: { _overwrite_overrides?: boolean; _user_id: string }
        Returns: undefined
      }
      can_admin_module: {
        Args: { _module_key: string; _user_id: string }
        Returns: boolean
      }
      can_edit_module: {
        Args: { _module_key: string; _user_id: string }
        Returns: boolean
      }
      can_manage_client: { Args: { _client_id: string }; Returns: boolean }
      can_manage_deal: { Args: { _deal_id: string }; Returns: boolean }
      can_manage_partner: { Args: { _partner_id: string }; Returns: boolean }
      can_view_client: { Args: { _client_id: string }; Returns: boolean }
      can_view_deal: { Args: { _deal_id: string }; Returns: boolean }
      can_view_module: {
        Args: { _module_key: string; _user_id: string }
        Returns: boolean
      }
      can_view_partner: { Args: { _partner_id: string }; Returns: boolean }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      generate_partner_code: {
        Args: { _company_name: string; _country_code: string }
        Returns: string
      }
      get_client_commercial_intelligence: {
        Args: { client_uuid: string }
        Returns: {
          active_contract_count: number
          active_license_count: number
          active_modules: Json
          active_plugins: Json
          active_renewal_count: number
          api_access: boolean
          backoffice_users: number
          client_id: string
          client_name: string
          commercial_score: number
          confidence: string
          country: string
          days_to_renewal: number
          deployment_type: string
          expansion_potential: number
          has_active_renewal: boolean
          has_contract: boolean
          has_license: boolean
          high_confidence_potential: number
          license_family: string
          license_variant: string
          low_confidence_potential: number
          medium_confidence_potential: number
          missing_modules: Json
          missing_plugins: Json
          next_renewal_date: string
          next_renewal_value: number
          not_renewed_items: Json
          one_time_items: Json
          one_time_value: number
          partner_id: string
          partner_name: string
          proposed_not_purchased: Json
          recommended_actions: Json
          recurring_arr: number
          recurring_items: Json
          renewal_risk: string
          risk_signals: Json
          sat_active: boolean
          sector: string
          updated_at: string
          upsell_opportunities: Json
          web_users: number
          year1_value: number
        }[]
      }
      get_effective_permissions: {
        Args: { _user_id: string }
        Returns: {
          access_level: string
          is_override: boolean
          module_key: string
          template_level: string
        }[]
      }
      get_my_effective_permissions: {
        Args: never
        Returns: {
          access_level: string
          is_override: boolean
          module_key: string
          template_level: string
        }[]
      }
      get_user_partner_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_hq_user: { Args: { _user_id: string }; Returns: boolean }
      is_partner_manager_for_partner: {
        Args: { _partner_id: string; _user_id: string }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      normalize_country: { Args: { _input: string }; Returns: string }
      pipeline_stage_probability: { Args: { _stage: string }; Returns: number }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recalculate_contract_total: {
        Args: { _contract_id: string }
        Returns: number
      }
      reset_user_to_role_template: {
        Args: { _user_id: string }
        Returns: undefined
      }
      resolve_user_by_name: { Args: { _name: string }; Returns: string }
      sync_role_template_to_users: {
        Args: {
          _overwrite_overrides?: boolean
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: number
      }
    }
    Enums: {
      app_role:
        | "hq_admin"
        | "partner_manager"
        | "hq_standard"
        | "partner_admin"
        | "partner_sales"
        | "partner_restricted"
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
        "hq_admin",
        "partner_manager",
        "hq_standard",
        "partner_admin",
        "partner_sales",
        "partner_restricted",
      ],
    },
  },
} as const
