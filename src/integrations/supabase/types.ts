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
      announcements: {
        Row: {
          audience_scope: string | null
          body: string | null
          category: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          partner_id: string | null
          published_at: string | null
          published_by: string | null
          title: string
        }
        Insert: {
          audience_scope?: string | null
          body?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          partner_id?: string | null
          published_at?: string | null
          published_by?: string | null
          title: string
        }
        Update: {
          audience_scope?: string | null
          body?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          partner_id?: string | null
          published_at?: string | null
          published_by?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
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
          assigned_user_id: string | null
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
        ]
      }
      deals: {
        Row: {
          aging_days: number | null
          asset_range: string | null
          assigned_salesperson: string | null
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
          total_value: number | null
          updated_at: string
        }
        Insert: {
          aging_days?: number | null
          asset_range?: string | null
          assigned_salesperson?: string | null
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
          total_value?: number | null
          updated_at?: string
        }
        Update: {
          aging_days?: number | null
          asset_range?: string | null
          assigned_salesperson?: string | null
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
          total_value?: number | null
          updated_at?: string
        }
        Relationships: []
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
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      incoming_leads: {
        Row: {
          asset_range: string | null
          company_name: string | null
          contact_name: string | null
          converted_to_deal_id: string | null
          country: string | null
          created_at: string
          email: string | null
          id: string
          job_role: string | null
          lead_owner_type: string | null
          lead_source: string | null
          linked_partner_id: string | null
          linked_partner_name: string | null
          maintenance_team_size: string | null
          notes: string | null
          phone: string | null
          routing_reason: string | null
          sector: string | null
          sharpspring_id: string | null
          status: string
        }
        Insert: {
          asset_range?: string | null
          company_name?: string | null
          contact_name?: string | null
          converted_to_deal_id?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          job_role?: string | null
          lead_owner_type?: string | null
          lead_source?: string | null
          linked_partner_id?: string | null
          linked_partner_name?: string | null
          maintenance_team_size?: string | null
          notes?: string | null
          phone?: string | null
          routing_reason?: string | null
          sector?: string | null
          sharpspring_id?: string | null
          status?: string
        }
        Update: {
          asset_range?: string | null
          company_name?: string | null
          contact_name?: string | null
          converted_to_deal_id?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          job_role?: string | null
          lead_owner_type?: string | null
          lead_source?: string | null
          linked_partner_id?: string | null
          linked_partner_name?: string | null
          maintenance_team_size?: string | null
          notes?: string | null
          phone?: string | null
          routing_reason?: string | null
          sector?: string | null
          sharpspring_id?: string | null
          status?: string
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
            foreignKeyName: "incoming_leads_linked_partner_id_fkey"
            columns: ["linked_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
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
          created_at: string
          expires_at: string | null
          id: string
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
          created_at?: string
          expires_at?: string | null
          id?: string
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
          created_at?: string
          expires_at?: string | null
          id?: string
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
          alert_notice_days: number | null
          assigned_manager_id: string | null
          company_name: string
          country: string | null
          created_at: string | null
          created_by: string | null
          health_score: number | null
          id: string
          is_active: boolean | null
          legal_name: string | null
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
          revenue_ytd: number | null
          start_date: string | null
          status: string | null
          tier_id: number | null
          total_revenue: number | null
          updated_at: string | null
          updated_by: string | null
          website: string | null
        }
        Insert: {
          alert_notice_days?: number | null
          assigned_manager_id?: string | null
          company_name: string
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          health_score?: number | null
          id?: string
          is_active?: boolean | null
          legal_name?: string | null
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
          revenue_ytd?: number | null
          start_date?: string | null
          status?: string | null
          tier_id?: number | null
          total_revenue?: number | null
          updated_at?: string | null
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          alert_notice_days?: number | null
          assigned_manager_id?: string | null
          company_name?: string
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          health_score?: number | null
          id?: string
          is_active?: boolean | null
          legal_name?: string | null
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
          revenue_ytd?: number | null
          start_date?: string | null
          status?: string | null
          tier_id?: number | null
          total_revenue?: number | null
          updated_at?: string | null
          updated_by?: string | null
          website?: string | null
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
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_items: {
        Row: {
          category: string
          created_at: string
          description: string | null
          frequency: string
          id: string
          is_override: boolean
          is_recurring: boolean
          item_code: string | null
          item_name: string
          proposal_id: string
          qty: number
          sort_order: number
          total: number
          unit_price: number
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          frequency?: string
          id?: string
          is_override?: boolean
          is_recurring?: boolean
          item_code?: string | null
          item_name: string
          proposal_id: string
          qty?: number
          sort_order?: number
          total?: number
          unit_price?: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          frequency?: string
          id?: string
          is_override?: boolean
          is_recurring?: boolean
          item_code?: string | null
          item_name?: string
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
          client_name: string
          country: string | null
          created_at: string
          created_by: string | null
          discount_amount: number | null
          discount_pct: number | null
          docx_url: string | null
          generated_at: string | null
          hosting: string
          id: string
          implementation_type: string | null
          include_requests_module: boolean
          language: string
          lead_id: string
          notes: string | null
          parent_proposal_id: string | null
          payment_terms: string | null
          pdf_url: string | null
          per_diem: number | null
          plan: number
          project_name: string | null
          proposal_date: string
          service_days: number | null
          service_hours: number | null
          services_subtotal: number | null
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
          client_name: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          discount_amount?: number | null
          discount_pct?: number | null
          docx_url?: string | null
          generated_at?: string | null
          hosting?: string
          id?: string
          implementation_type?: string | null
          include_requests_module?: boolean
          language?: string
          lead_id: string
          notes?: string | null
          parent_proposal_id?: string | null
          payment_terms?: string | null
          pdf_url?: string | null
          per_diem?: number | null
          plan?: number
          project_name?: string | null
          proposal_date?: string
          service_days?: number | null
          service_hours?: number | null
          services_subtotal?: number | null
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
          client_name?: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          discount_amount?: number | null
          discount_pct?: number | null
          docx_url?: string | null
          generated_at?: string | null
          hosting?: string
          id?: string
          implementation_type?: string | null
          include_requests_module?: boolean
          language?: string
          lead_id?: string
          notes?: string | null
          parent_proposal_id?: string | null
          payment_terms?: string | null
          pdf_url?: string | null
          per_diem?: number | null
          plan?: number
          project_name?: string | null
          proposal_date?: string
          service_days?: number | null
          service_hours?: number | null
          services_subtotal?: number | null
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
          module_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_level?: string
          created_at?: string
          id?: string
          module_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_level?: string
          created_at?: string
          id?: string
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
      [_ in never]: never
    }
    Functions: {
      active_hq_admin_count: { Args: never; Returns: number }
      can_manage_client: { Args: { _client_id: string }; Returns: boolean }
      can_manage_deal: { Args: { _deal_id: string }; Returns: boolean }
      can_manage_partner: { Args: { _partner_id: string }; Returns: boolean }
      can_view_client: { Args: { _client_id: string }; Returns: boolean }
      can_view_deal: { Args: { _deal_id: string }; Returns: boolean }
      can_view_partner: { Args: { _partner_id: string }; Returns: boolean }
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
