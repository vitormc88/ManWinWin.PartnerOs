-- Prospecting / Target Account v1

CREATE TABLE IF NOT EXISTS public.target_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  country text NOT NULL,
  website text,
  website_domain text,
  industry text,
  maintenance_environment text,
  size_context text,
  fit_indicators jsonb NOT NULL DEFAULT '[]'::jsonb,
  maintenance_hypothesis text,
  unknowns jsonb NOT NULL DEFAULT '[]'::jsonb,
  key_research_gap text,
  fit_score smallint NOT NULL DEFAULT 0 CHECK (fit_score BETWEEN 0 AND 3),
  complexity_score smallint NOT NULL DEFAULT 0 CHECK (complexity_score BETWEEN 0 AND 3),
  signal_score smallint NOT NULL DEFAULT 0 CHECK (signal_score BETWEEN 0 AND 3),
  access_score smallint NOT NULL DEFAULT 0 CHECK (access_score BETWEEN 0 AND 3),
  priority_total smallint GENERATED ALWAYS AS (fit_score + complexity_score + signal_score + access_score) STORED,
  confidence text NOT NULL DEFAULT 'low' CHECK (confidence IN ('low','medium','high')),
  status text NOT NULL DEFAULT 'Researching' CHECK (status IN ('Researching','Ready for Outreach','Deprioritised','Converted')),
  deprioritised_reason text,
  owner_user_id uuid,
  partner_uuid uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  created_by uuid,
  converted_lead_id uuid REFERENCES public.incoming_leads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS target_accounts_partner_idx ON public.target_accounts(partner_uuid);
CREATE INDEX IF NOT EXISTS target_accounts_status_idx ON public.target_accounts(status);
CREATE INDEX IF NOT EXISTS target_accounts_domain_idx ON public.target_accounts(website_domain);

CREATE TABLE IF NOT EXISTS public.target_account_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_account_id uuid NOT NULL REFERENCES public.target_accounts(id) ON DELETE CASCADE,
  fact text NOT NULL,
  source text,
  link text,
  evidence_date date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS target_account_evidence_parent_idx ON public.target_account_evidence(target_account_id);

CREATE TABLE IF NOT EXISTS public.target_account_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_account_id uuid NOT NULL REFERENCES public.target_accounts(id) ON DELETE CASCADE,
  signal_type text NOT NULL CHECK (signal_type IN (
    'expansion_new_site','new_equipment_capex','maintenance_hiring','new_leadership',
    'digital_transformation','erp_technology_project','compliance_audit',
    'sustainability_efficiency','acquisition_growth','new_contract_service_expansion','other')),
  description text,
  signal_date date,
  source text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS target_account_signals_parent_idx ON public.target_account_signals(target_account_id);

CREATE TABLE IF NOT EXISTS public.target_account_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_account_id uuid NOT NULL REFERENCES public.target_accounts(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  job_title text,
  conversation_role text NOT NULL DEFAULT 'unknown' CHECK (conversation_role IN (
    'maintenance_problem_owner','operations','management','it_technical',
    'finance_economic','quality_hse','user_influencer','unknown')),
  is_primary_contact boolean NOT NULL DEFAULT false,
  email text,
  phone text,
  linkedin_url text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS target_account_people_parent_idx ON public.target_account_people(target_account_id);
CREATE UNIQUE INDEX IF NOT EXISTS target_account_people_primary_unique
  ON public.target_account_people(target_account_id) WHERE is_primary_contact;

-- Reserved for Module 5 outreach (no UI in v1)
CREATE TABLE IF NOT EXISTS public.target_account_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_account_id uuid NOT NULL REFERENCES public.target_accounts(id) ON DELETE CASCADE,
  person_id uuid REFERENCES public.target_account_people(id) ON DELETE SET NULL,
  channel text,
  outcome text,
  notes text,
  performed_by uuid,
  performed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS target_account_activities_parent_idx ON public.target_account_activities(target_account_id);

-- Reverse traceability on leads (additive, nullable)
ALTER TABLE public.incoming_leads
  ADD COLUMN IF NOT EXISTS source_target_account_id uuid REFERENCES public.target_accounts(id) ON DELETE SET NULL;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.target_accounts TO authenticated;
GRANT ALL ON public.target_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.target_account_evidence TO authenticated;
GRANT ALL ON public.target_account_evidence TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.target_account_signals TO authenticated;
GRANT ALL ON public.target_account_signals TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.target_account_people TO authenticated;
GRANT ALL ON public.target_account_people TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.target_account_activities TO authenticated;
GRANT ALL ON public.target_account_activities TO service_role;

ALTER TABLE public.target_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.target_account_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.target_account_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.target_account_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.target_account_activities ENABLE ROW LEVEL SECURITY;

-- Helper: can the caller see / manage a target account row?
CREATE OR REPLACE FUNCTION public.can_view_target_account(_account_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.target_accounts ta
    WHERE ta.id = _account_id
      AND (public.is_hq_user(auth.uid())
           OR (ta.partner_uuid IS NOT NULL AND ta.partner_uuid = public.get_user_partner_id(auth.uid())))
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_target_account(_account_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.target_accounts ta
    WHERE ta.id = _account_id
      AND (public.has_role(auth.uid(), 'hq_admin'::app_role)
           OR public.has_role(auth.uid(), 'hq_standard'::app_role)
           OR (ta.partner_uuid IS NOT NULL AND ta.partner_uuid = public.get_user_partner_id(auth.uid())))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_view_target_account(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_target_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_target_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_target_account(uuid) TO authenticated;

DROP POLICY IF EXISTS target_accounts_select ON public.target_accounts;
CREATE POLICY target_accounts_select ON public.target_accounts FOR SELECT TO authenticated
  USING (public.is_hq_user(auth.uid())
         OR (partner_uuid IS NOT NULL AND partner_uuid = public.get_user_partner_id(auth.uid())));

DROP POLICY IF EXISTS target_accounts_insert ON public.target_accounts;
CREATE POLICY target_accounts_insert ON public.target_accounts FOR INSERT TO authenticated
  WITH CHECK (public.is_hq_user(auth.uid())
              OR (partner_uuid IS NOT NULL AND partner_uuid = public.get_user_partner_id(auth.uid())));

DROP POLICY IF EXISTS target_accounts_update ON public.target_accounts;
CREATE POLICY target_accounts_update ON public.target_accounts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'hq_admin'::app_role)
         OR public.has_role(auth.uid(), 'hq_standard'::app_role)
         OR (partner_uuid IS NOT NULL AND partner_uuid = public.get_user_partner_id(auth.uid())));

DROP POLICY IF EXISTS target_accounts_delete ON public.target_accounts;
CREATE POLICY target_accounts_delete ON public.target_accounts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'hq_admin'::app_role));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['target_account_evidence','target_account_signals','target_account_people','target_account_activities'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_select ON public.%1$s FOR SELECT TO authenticated USING (public.can_view_target_account(target_account_id))', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_insert ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_insert ON public.%1$s FOR INSERT TO authenticated WITH CHECK (public.can_manage_target_account(target_account_id))', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_update ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_update ON public.%1$s FOR UPDATE TO authenticated USING (public.can_manage_target_account(target_account_id))', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_delete ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_delete ON public.%1$s FOR DELETE TO authenticated USING (public.can_manage_target_account(target_account_id))', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.target_accounts_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

REVOKE EXECUTE ON FUNCTION public.target_accounts_touch_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_target_accounts_updated_at ON public.target_accounts;
CREATE TRIGGER trg_target_accounts_updated_at BEFORE UPDATE ON public.target_accounts
FOR EACH ROW EXECUTE FUNCTION public.target_accounts_touch_updated_at();