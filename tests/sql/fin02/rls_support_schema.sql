-- FIN02 Gate 2B: isolated synthetic identity graph and referenced foreign tables.
-- NOT a schema dump; this is the minimum table subset to exercise the TEST
-- helper bodies and all 36 actual TEST financial RLS policies.
-- NEVER apply to live TEST/PROD.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TYPE public.app_role AS ENUM (
  'hq_admin','partner_manager','hq_standard','partner_admin',
  'partner_sales','partner_restricted','partner_connector',
  'partner_reseller_trainee','partner_implementer_trainee'
);
CREATE TABLE public.partners (
  id uuid PRIMARY KEY,
  assigned_manager_id uuid
);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  partner_id uuid REFERENCES public.partners(id),
  is_hq boolean DEFAULT false
);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  role public.app_role NOT NULL
);
CREATE TABLE public.role_permission_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  module_key text NOT NULL,
  access_level text NOT NULL DEFAULT 'no_access'
);
CREATE TABLE public.user_module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  module_key text NOT NULL,
  access_level text NOT NULL DEFAULT 'no_access',
  is_override boolean NOT NULL DEFAULT true
);
CREATE TABLE public.modules_catalog (id uuid PRIMARY KEY);
CREATE TABLE public.plugins_catalog (id uuid PRIMARY KEY);
CREATE TABLE public.plan_transition_rules (id uuid PRIMARY KEY);

-- Ten cross-boundary FKs from TEST; these reference only synthetic fixtures.
ALTER TABLE public.clients ADD CONSTRAINT clients_account_manager_id_fkey FOREIGN KEY (account_manager_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD CONSTRAINT clients_manager_owner_id_fkey FOREIGN KEY (manager_owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD CONSTRAINT clients_partner_uuid_fkey FOREIGN KEY (partner_uuid) REFERENCES public.partners(id) ON DELETE SET NULL;
ALTER TABLE public.contract_lines ADD CONSTRAINT contract_lines_related_module_id_fkey FOREIGN KEY (related_module_id) REFERENCES public.modules_catalog(id) ON DELETE SET NULL;
ALTER TABLE public.contract_lines ADD CONSTRAINT contract_lines_related_plugin_id_fkey FOREIGN KEY (related_plugin_id) REFERENCES public.plugins_catalog(id) ON DELETE SET NULL;
ALTER TABLE public.deals ADD CONSTRAINT deals_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.proposals ADD CONSTRAINT proposals_implementation_transition_rule_id_fkey FOREIGN KEY (implementation_transition_rule_id) REFERENCES public.plan_transition_rules(id);
ALTER TABLE public.proposals ADD CONSTRAINT proposals_partner_uuid_fkey FOREIGN KEY (partner_uuid) REFERENCES public.partners(id) ON DELETE SET NULL;
ALTER TABLE public.renewals ADD CONSTRAINT renewals_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.renewals ADD CONSTRAINT renewals_partner_uuid_fkey FOREIGN KEY (partner_uuid) REFERENCES public.partners(id) ON DELETE SET NULL;

-- The identity is always supplied explicitly by a synthetic session.
-- This is NOT the Supabase Auth server/JWT verification implementation.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE SET search_path TO 'pg_catalog' AS $$
SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
REVOKE ALL ON FUNCTION auth.uid() FROM PUBLIC;
GRANT USAGE ON SCHEMA auth TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
GRANT USAGE ON SCHEMA public TO authenticated, anon;
-- Read-only role-grant baseline for identity fixtures: schema tests still use
-- original TEST RLS predicates to decide access to the eight finance tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON
 public.clients,public.contract_lines,public.contracts,public.deals,
 public.licenses,public.proposal_items,public.proposals,public.renewals
 TO authenticated;
GRANT SELECT ON
 public.clients,public.contract_lines,public.contracts,public.deals,
 public.licenses,public.renewals TO anon;

-- No direct authenticated access to our synthetic identity source tables.
-- SECURITY DEFINER helpers use the fixture tables through their owner.
REVOKE ALL ON
 public.profiles,public.user_roles,public.partners,
 public.role_permission_templates,public.user_module_permissions
 FROM PUBLIC,authenticated,anon;
