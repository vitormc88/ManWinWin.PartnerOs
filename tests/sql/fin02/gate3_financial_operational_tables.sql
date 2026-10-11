-- FIN02 Gate3 supplemental original TEST table COLUMN definitions and constraints.
-- No real rows. Isolated CI only. Do not apply to TEST/PROD.

CREATE TABLE public."client_revenue_history" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "partner_id" uuid,
  "contract_id" uuid,
  "renewal_id" uuid,
  "proposal_id" uuid,
  "revenue_type" text NOT NULL,
  "amount" numeric(14,2) NOT NULL,
  "currency" text DEFAULT 'EUR'::text NOT NULL,
  "revenue_date" date NOT NULL,
  "source" text DEFAULT 'manual'::text NOT NULL,
  "source_reference" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."licensed_modules" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "license_id" uuid NOT NULL,
  "module_name" text NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "license_type" text,
  "periodicity" text,
  "start_date" date,
  "end_date" date,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "module_id" uuid,
  "plugin_id" uuid,
  "item_type" text,
  "quantity" numeric DEFAULT 1 NOT NULL,
  "unit_price" numeric,
  "included_in_base" boolean DEFAULT false NOT NULL
);

CREATE TABLE public."lifecycle_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid,
  "event_type" text NOT NULL,
  "event_title" text NOT NULL,
  "event_description" text,
  "actor_id" uuid,
  "actor_name" text,
  "source_proposal_id" uuid,
  "source_proposal_number" text,
  "source_license_id" uuid,
  "source_contract_id" uuid,
  "source_renewal_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."renewal_activities" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "renewal_id" uuid NOT NULL,
  "action" text NOT NULL,
  "from_status" text,
  "to_status" text,
  "performed_by" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public."client_revenue_history" ADD CONSTRAINT "client_revenue_history_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public."client_revenue_history" ADD CONSTRAINT "client_revenue_history_contract_id_fkey" FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL;
ALTER TABLE public."client_revenue_history" ADD CONSTRAINT "client_revenue_history_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;
ALTER TABLE public."client_revenue_history" ADD CONSTRAINT "client_revenue_history_proposal_id_fkey" FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE SET NULL;
ALTER TABLE public."client_revenue_history" ADD CONSTRAINT "client_revenue_history_renewal_id_fkey" FOREIGN KEY (renewal_id) REFERENCES renewals(id) ON DELETE SET NULL;
ALTER TABLE public."client_revenue_history" ADD CONSTRAINT "client_revenue_history_pkey" PRIMARY KEY (id);
ALTER TABLE public."client_revenue_history" ADD CONSTRAINT "client_revenue_history_client_source_reference_key" UNIQUE (client_id, source_reference);
ALTER TABLE public."licensed_modules" ADD CONSTRAINT "licensed_modules_license_id_fkey" FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE;
ALTER TABLE public."licensed_modules" ADD CONSTRAINT "licensed_modules_module_id_fkey" FOREIGN KEY (module_id) REFERENCES modules_catalog(id) ON DELETE SET NULL;
ALTER TABLE public."licensed_modules" ADD CONSTRAINT "licensed_modules_plugin_id_fkey" FOREIGN KEY (plugin_id) REFERENCES plugins_catalog(id) ON DELETE SET NULL;
ALTER TABLE public."licensed_modules" ADD CONSTRAINT "licensed_modules_pkey" PRIMARY KEY (id);
ALTER TABLE public."lifecycle_events" ADD CONSTRAINT "lifecycle_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public."lifecycle_events" ADD CONSTRAINT "lifecycle_events_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public."lifecycle_events" ADD CONSTRAINT "lifecycle_events_source_contract_id_fkey" FOREIGN KEY (source_contract_id) REFERENCES contracts(id) ON DELETE SET NULL;
ALTER TABLE public."lifecycle_events" ADD CONSTRAINT "lifecycle_events_source_license_id_fkey" FOREIGN KEY (source_license_id) REFERENCES licenses(id) ON DELETE SET NULL;
ALTER TABLE public."lifecycle_events" ADD CONSTRAINT "lifecycle_events_source_proposal_id_fkey" FOREIGN KEY (source_proposal_id) REFERENCES proposals(id) ON DELETE SET NULL;
ALTER TABLE public."lifecycle_events" ADD CONSTRAINT "lifecycle_events_source_renewal_id_fkey" FOREIGN KEY (source_renewal_id) REFERENCES renewals(id) ON DELETE SET NULL;
ALTER TABLE public."lifecycle_events" ADD CONSTRAINT "lifecycle_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."renewal_activities" ADD CONSTRAINT "renewal_activities_renewal_id_fkey" FOREIGN KEY (renewal_id) REFERENCES renewals(id) ON DELETE CASCADE;
ALTER TABLE public."renewal_activities" ADD CONSTRAINT "renewal_activities_pkey" PRIMARY KEY (id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
CREATE SCHEMA IF NOT EXISTS private;
