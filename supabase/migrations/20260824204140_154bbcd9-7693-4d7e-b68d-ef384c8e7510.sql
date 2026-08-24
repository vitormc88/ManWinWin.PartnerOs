-- Reusable lead visibility helpers (mirror incoming_leads policies)
CREATE OR REPLACE FUNCTION public.can_view_lead(_lead_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.incoming_leads l
    WHERE l.id = _lead_id
      AND (
        public.is_hq_user(auth.uid())
        OR (l.linked_partner_id IS NOT NULL AND l.linked_partner_id = public.get_user_partner_id(auth.uid()))
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_lead(_lead_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.incoming_leads l
    WHERE l.id = _lead_id
      AND (
        public.has_role(auth.uid(), 'hq_admin'::app_role)
        OR public.has_role(auth.uid(), 'hq_standard'::app_role)
        OR (l.linked_partner_id IS NOT NULL AND l.linked_partner_id = public.get_user_partner_id(auth.uid()))
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_view_lead(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_lead(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_lead(uuid) TO authenticated, service_role;

-- ============================================================ discovery
CREATE TABLE IF NOT EXISTS public.discovery_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.incoming_leads(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE,
  -- CURRENT
  current_process text,
  current_people text,
  current_tools text,
  current_workflow text,
  current_known_facts text,
  current_hypotheses text,
  current_unknowns text,
  -- PROBLEM
  problem_statement text,
  problem_evidence text,
  problem_frequency text,
  problem_scope text,
  problem_affected text,
  root_cause_confidence text,
  -- IMPACT
  impact_operational text,
  impact_financial text,
  impact_risk text,
  impact_customer text,
  impact_people text,
  cost_of_inaction text,
  impact_evidence_level text,
  -- FUTURE
  future_desired_outcomes text,
  future_priorities text,
  future_success_criteria text,
  future_target_state text,
  future_constraints text,
  -- ALIGN
  align_shared_summary text,
  align_validation_status text NOT NULL DEFAULT 'not_shared',
  align_validated_at timestamptz,
  align_stakeholder_alignment text,
  align_open_questions text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discovery_records_one_parent CHECK (num_nonnulls(lead_id, deal_id) >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS discovery_records_lead_uniq ON public.discovery_records(lead_id) WHERE lead_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS discovery_records_deal_uniq ON public.discovery_records(deal_id) WHERE deal_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_records TO authenticated;
GRANT ALL ON public.discovery_records TO service_role;
ALTER TABLE public.discovery_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discovery_records_select ON public.discovery_records;
CREATE POLICY discovery_records_select ON public.discovery_records FOR SELECT TO authenticated
USING (
  (lead_id IS NOT NULL AND public.can_view_lead(lead_id))
  OR (deal_id IS NOT NULL AND public.can_view_deal(deal_id))
);

DROP POLICY IF EXISTS discovery_records_insert ON public.discovery_records;
CREATE POLICY discovery_records_insert ON public.discovery_records FOR INSERT TO authenticated
WITH CHECK (
  (lead_id IS NOT NULL AND public.can_manage_lead(lead_id))
  OR (deal_id IS NOT NULL AND public.can_manage_deal(deal_id))
);

DROP POLICY IF EXISTS discovery_records_update ON public.discovery_records;
CREATE POLICY discovery_records_update ON public.discovery_records FOR UPDATE TO authenticated
USING (
  (lead_id IS NOT NULL AND public.can_manage_lead(lead_id))
  OR (deal_id IS NOT NULL AND public.can_manage_deal(deal_id))
)
WITH CHECK (
  (lead_id IS NOT NULL AND public.can_manage_lead(lead_id))
  OR (deal_id IS NOT NULL AND public.can_manage_deal(deal_id))
);

DROP POLICY IF EXISTS discovery_records_delete ON public.discovery_records;
CREATE POLICY discovery_records_delete ON public.discovery_records FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'hq_admin'::app_role));

DROP TRIGGER IF EXISTS trg_discovery_records_updated_at ON public.discovery_records;
CREATE TRIGGER trg_discovery_records_updated_at BEFORE UPDATE ON public.discovery_records
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ================================================ discovery stakeholders
CREATE TABLE IF NOT EXISTS public.discovery_stakeholders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discovery_id uuid NOT NULL REFERENCES public.discovery_records(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  job_title text,
  email text,
  phone text,
  buying_role text,
  influence text,
  attitude text,
  concerns text,
  required_action text,
  source_deal_contact_id uuid REFERENCES public.deal_contacts(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS discovery_stakeholders_discovery_idx ON public.discovery_stakeholders(discovery_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_stakeholders TO authenticated;
GRANT ALL ON public.discovery_stakeholders TO service_role;
ALTER TABLE public.discovery_stakeholders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discovery_stakeholders_select ON public.discovery_stakeholders;
CREATE POLICY discovery_stakeholders_select ON public.discovery_stakeholders FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.discovery_records d
  WHERE d.id = discovery_id
    AND ((d.lead_id IS NOT NULL AND public.can_view_lead(d.lead_id)) OR (d.deal_id IS NOT NULL AND public.can_view_deal(d.deal_id)))
));

DROP POLICY IF EXISTS discovery_stakeholders_insert ON public.discovery_stakeholders;
CREATE POLICY discovery_stakeholders_insert ON public.discovery_stakeholders FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.discovery_records d
  WHERE d.id = discovery_id
    AND ((d.lead_id IS NOT NULL AND public.can_manage_lead(d.lead_id)) OR (d.deal_id IS NOT NULL AND public.can_manage_deal(d.deal_id)))
));

DROP POLICY IF EXISTS discovery_stakeholders_update ON public.discovery_stakeholders;
CREATE POLICY discovery_stakeholders_update ON public.discovery_stakeholders FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.discovery_records d
  WHERE d.id = discovery_id
    AND ((d.lead_id IS NOT NULL AND public.can_manage_lead(d.lead_id)) OR (d.deal_id IS NOT NULL AND public.can_manage_deal(d.deal_id)))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.discovery_records d
  WHERE d.id = discovery_id
    AND ((d.lead_id IS NOT NULL AND public.can_manage_lead(d.lead_id)) OR (d.deal_id IS NOT NULL AND public.can_manage_deal(d.deal_id)))
));

DROP POLICY IF EXISTS discovery_stakeholders_delete ON public.discovery_stakeholders;
CREATE POLICY discovery_stakeholders_delete ON public.discovery_stakeholders FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.discovery_records d
  WHERE d.id = discovery_id
    AND ((d.lead_id IS NOT NULL AND public.can_manage_lead(d.lead_id)) OR (d.deal_id IS NOT NULL AND public.can_manage_deal(d.deal_id)))
));

DROP TRIGGER IF EXISTS trg_discovery_stakeholders_updated_at ON public.discovery_stakeholders;
CREATE TRIGGER trg_discovery_stakeholders_updated_at BEFORE UPDATE ON public.discovery_stakeholders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =================================================== agreed next steps
CREATE TABLE IF NOT EXISTS public.agreed_next_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.incoming_leads(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE,
  title text NOT NULL,
  step_type text,
  internal_owner_user_id uuid,
  customer_contact_name text,
  customer_contact_email text,
  due_at timestamptz,
  agreed_with_customer boolean NOT NULL DEFAULT false,
  agreed_at timestamptz,
  source_activity text,
  status text NOT NULL DEFAULT 'open',
  completed_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agreed_next_steps_one_parent CHECK (num_nonnulls(lead_id, deal_id) >= 1)
);

CREATE INDEX IF NOT EXISTS agreed_next_steps_lead_idx ON public.agreed_next_steps(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agreed_next_steps_deal_idx ON public.agreed_next_steps(deal_id) WHERE deal_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agreed_next_steps TO authenticated;
GRANT ALL ON public.agreed_next_steps TO service_role;
ALTER TABLE public.agreed_next_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agreed_next_steps_select ON public.agreed_next_steps;
CREATE POLICY agreed_next_steps_select ON public.agreed_next_steps FOR SELECT TO authenticated
USING (
  (lead_id IS NOT NULL AND public.can_view_lead(lead_id))
  OR (deal_id IS NOT NULL AND public.can_view_deal(deal_id))
);

DROP POLICY IF EXISTS agreed_next_steps_insert ON public.agreed_next_steps;
CREATE POLICY agreed_next_steps_insert ON public.agreed_next_steps FOR INSERT TO authenticated
WITH CHECK (
  (lead_id IS NOT NULL AND public.can_manage_lead(lead_id))
  OR (deal_id IS NOT NULL AND public.can_manage_deal(deal_id))
);

DROP POLICY IF EXISTS agreed_next_steps_update ON public.agreed_next_steps;
CREATE POLICY agreed_next_steps_update ON public.agreed_next_steps FOR UPDATE TO authenticated
USING (
  (lead_id IS NOT NULL AND public.can_manage_lead(lead_id))
  OR (deal_id IS NOT NULL AND public.can_manage_deal(deal_id))
)
WITH CHECK (
  (lead_id IS NOT NULL AND public.can_manage_lead(lead_id))
  OR (deal_id IS NOT NULL AND public.can_manage_deal(deal_id))
);

DROP POLICY IF EXISTS agreed_next_steps_delete ON public.agreed_next_steps;
CREATE POLICY agreed_next_steps_delete ON public.agreed_next_steps FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'hq_admin'::app_role));

DROP TRIGGER IF EXISTS trg_agreed_next_steps_updated_at ON public.agreed_next_steps;
CREATE TRIGGER trg_agreed_next_steps_updated_at BEFORE UPDATE ON public.agreed_next_steps
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ================================================ stage gate overrides
CREATE TABLE IF NOT EXISTS public.stage_gate_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  lead_id uuid REFERENCES public.incoming_leads(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE,
  from_stage text,
  to_stage text NOT NULL,
  missing_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text NOT NULL,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stage_gate_overrides_one_parent CHECK (num_nonnulls(lead_id, deal_id) >= 1)
);

CREATE INDEX IF NOT EXISTS stage_gate_overrides_lead_idx ON public.stage_gate_overrides(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stage_gate_overrides_deal_idx ON public.stage_gate_overrides(deal_id) WHERE deal_id IS NOT NULL;

GRANT SELECT, INSERT ON public.stage_gate_overrides TO authenticated;
GRANT ALL ON public.stage_gate_overrides TO service_role;
ALTER TABLE public.stage_gate_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stage_gate_overrides_select ON public.stage_gate_overrides;
CREATE POLICY stage_gate_overrides_select ON public.stage_gate_overrides FOR SELECT TO authenticated
USING (
  (lead_id IS NOT NULL AND public.can_view_lead(lead_id))
  OR (deal_id IS NOT NULL AND public.can_view_deal(deal_id))
);

DROP POLICY IF EXISTS stage_gate_overrides_insert ON public.stage_gate_overrides;
CREATE POLICY stage_gate_overrides_insert ON public.stage_gate_overrides FOR INSERT TO authenticated
WITH CHECK (
  (lead_id IS NOT NULL AND public.can_manage_lead(lead_id))
  OR (deal_id IS NOT NULL AND public.can_manage_deal(deal_id))
);

COMMENT ON TABLE public.stage_gate_overrides IS 'Append-only audit of stage advances made despite missing commercial evidence.';