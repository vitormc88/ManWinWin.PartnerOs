
-- ============================================
-- PROPOSAL GENERATOR: Schema + RLS + Seed
-- ============================================

-- Pricing rules (HQ-managed catalog)
CREATE TABLE public.pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  category text NOT NULL DEFAULT 'software', -- software | service | addon
  unit_price numeric NOT NULL DEFAULT 0,
  unit_type text NOT NULL DEFAULT 'one-time', -- monthly | yearly | one-time | per-user-month | per-hour
  currency text NOT NULL DEFAULT 'EUR',
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY pricing_rules_select ON public.pricing_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY pricing_rules_insert ON public.pricing_rules
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'hq_admin'::app_role));
CREATE POLICY pricing_rules_update ON public.pricing_rules
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'hq_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'hq_admin'::app_role));
CREATE POLICY pricing_rules_delete ON public.pricing_rules
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'hq_admin'::app_role));

CREATE TRIGGER pricing_rules_updated_at BEFORE UPDATE ON public.pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Proposals
CREATE TABLE public.proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  parent_proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  language text NOT NULL DEFAULT 'EN', -- PT | EN | ES
  plan integer NOT NULL DEFAULT 1, -- 1 | 2 | 3
  status text NOT NULL DEFAULT 'Draft', -- Draft | Ready | Sent | Won | Lost
  hosting text NOT NULL DEFAULT 'SaaS', -- SaaS | On-Premise
  client_name text NOT NULL,
  project_name text,
  country text,
  proposal_date date NOT NULL DEFAULT CURRENT_DATE,
  validity_days integer NOT NULL DEFAULT 60,
  payment_terms text,
  notes text,
  -- service config
  implementation_type text DEFAULT 'Online', -- Online | Onsite | RCI Professional | Light Implementation
  service_days numeric,
  service_hours numeric,
  backoffice_work_hours numeric,
  per_diem numeric DEFAULT 0,
  discount_pct numeric DEFAULT 0,
  -- module toggles
  include_requests_module boolean NOT NULL DEFAULT false,
  web_users integer NOT NULL DEFAULT 0,
  -- totals (denormalized for list views)
  software_subtotal numeric DEFAULT 0,
  services_subtotal numeric DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  total_year_1 numeric DEFAULT 0,
  total_recurring numeric DEFAULT 0,
  -- generated assets
  docx_url text,
  pdf_url text,
  generated_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposals_lead_id ON public.proposals(lead_id);
CREATE INDEX idx_proposals_status ON public.proposals(status);

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

-- Proposals follow same access rules as deals (lead_id references deals.id)
CREATE POLICY proposals_select ON public.proposals
  FOR SELECT TO authenticated USING (can_view_deal(lead_id));
CREATE POLICY proposals_insert ON public.proposals
  FOR INSERT TO authenticated WITH CHECK (can_manage_deal(lead_id));
CREATE POLICY proposals_update ON public.proposals
  FOR UPDATE TO authenticated USING (can_manage_deal(lead_id)) WITH CHECK (can_manage_deal(lead_id));
CREATE POLICY proposals_delete ON public.proposals
  FOR DELETE TO authenticated USING (can_manage_deal(lead_id));

CREATE TRIGGER proposals_updated_at BEFORE UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Proposal items
CREATE TABLE public.proposal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'software', -- software | service | addon | custom
  item_code text, -- references pricing_rules.code when applicable
  item_name text NOT NULL,
  description text,
  qty numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  frequency text NOT NULL DEFAULT 'one-time', -- monthly | yearly | one-time | per-user-month | per-hour
  total numeric NOT NULL DEFAULT 0, -- yearly-equivalent total
  is_override boolean NOT NULL DEFAULT false,
  is_recurring boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposal_items_proposal_id ON public.proposal_items(proposal_id);

ALTER TABLE public.proposal_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY proposal_items_select ON public.proposal_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_items.proposal_id AND can_view_deal(p.lead_id))
  );
CREATE POLICY proposal_items_insert ON public.proposal_items
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_items.proposal_id AND can_manage_deal(p.lead_id))
  );
CREATE POLICY proposal_items_update ON public.proposal_items
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_items.proposal_id AND can_manage_deal(p.lead_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_items.proposal_id AND can_manage_deal(p.lead_id))
  );
CREATE POLICY proposal_items_delete ON public.proposal_items
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_items.proposal_id AND can_manage_deal(p.lead_id))
  );

-- Proposal templates (placeholder for future per-language template overrides)
CREATE TABLE public.proposal_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  language text NOT NULL DEFAULT 'EN',
  type text NOT NULL DEFAULT 'manwinwin_professional',
  template_file text,
  payment_terms text,
  notes_template text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.proposal_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY proposal_templates_select ON public.proposal_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY proposal_templates_manage ON public.proposal_templates
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'hq_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'hq_admin'::app_role));

CREATE TRIGGER proposal_templates_updated_at BEFORE UPDATE ON public.proposal_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================
-- SEED PRICING from attached price sheet
-- ============================================
INSERT INTO public.pricing_rules (code, label, category, unit_price, unit_type, notes) VALUES
  -- Annual licenses
  ('plan_1_annual',           'ManWinWin Professional - Plan 1 (annual license)', 'software', 936,  'yearly',          'Maintenance Module only'),
  ('plan_2_annual',           'ManWinWin Professional - Plan 2 (annual license)', 'software', 1296, 'yearly',          'Maintenance + Stock + Purchase Orders'),
  ('plan_3_annual',           'ManWinWin Professional - Plan 3 (annual license)', 'software', 1800, 'yearly',          'Plan 2 + Plugins (Workflow / Adv Reports / Import / SLA) + API'),
  -- Monthly equivalents
  ('plan_1_monthly_user',     'Plan 1 monthly (per user)', 'software', 39, 'per-user-month', 'Reference only'),
  ('plan_2_monthly_user',     'Plan 2 monthly (per user)', 'software', 54, 'per-user-month', 'Reference only'),
  ('plan_3_monthly_user',     'Plan 3 monthly (per user)', 'software', 75, 'per-user-month', 'Reference only'),
  -- Add-ons
  ('requests_module',         'Maintenance Requests Module (PMan)', 'addon',    600, 'yearly',          'Optional, available for all plans'),
  ('web_user',                'ManWinWin WEB / Mobility additional access', 'addon', 20, 'per-user-month', '20 EUR / user / month'),
  ('api_access',              'API ManWinWin', 'addon', 0, 'yearly', 'Included in Plan 3'),
  -- Implementation services (one-time)
  ('impl_online_p1',          'Online Implementation - Plan 1', 'service', 1890, 'one-time', '15 standard hours'),
  ('impl_online_p2',          'Online Implementation - Plan 2', 'service', 2700, 'one-time', '20 standard hours'),
  ('impl_online_p3',          'Online Implementation - Plan 3', 'service', 3590, 'one-time', '25 standard hours'),
  ('impl_light_p1',           'Online Light Implementation - Plan 1', 'service', 990, 'one-time', '6 light hours'),
  ('impl_light_p2',           'Online Light Implementation - Plan 2', 'service', 1290, 'one-time', '8 light hours'),
  ('impl_light_p3',           'Online Light Implementation - Plan 3', 'service', 1650, 'one-time', '10 light hours'),
  ('impl_requests',           'Online Maintenance Requests Implementation', 'service', 245, 'one-time', '1 hour'),
  ('impl_session',            'Additional Session', 'service', 360, 'one-time', 'Per extra session'),
  -- Onsite/per-diem placeholders (HQ adjustable)
  ('onsite_per_diem',         'Onsite per diem', 'service', 250, 'one-time', 'Travel per diem (default)'),
  ('rci_professional',        'RCI Professional', 'service', 0, 'one-time', 'Configure as needed');

-- Default templates
INSERT INTO public.proposal_templates (language, type, payment_terms, notes_template) VALUES
  ('EN', 'manwinwin_professional',
    '50% invoice on the date of award, payment in full. 50% invoice on the date of installation, payment within 30 days.',
    'VAT at the legal rate in force is added to the values presented.'),
  ('PT', 'manwinwin_professional',
    '50% de fatura na data da adjudicação, pagamento integral. 50% de fatura na data da instalação, pagamento a 30 dias.',
    'IVA à taxa legal em vigor adicionado aos valores apresentados.'),
  ('ES', 'manwinwin_professional',
    '50% factura en la fecha de adjudicación, pago íntegro. 50% factura en la fecha de instalación, pago a 30 días.',
    'IVA a la tasa legal vigente añadido a los valores presentados.');

-- ============================================
-- STORAGE BUCKET for generated proposals
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('proposals', 'proposals', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY proposals_storage_select ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'proposals');
CREATE POLICY proposals_storage_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'proposals');
CREATE POLICY proposals_storage_update ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'proposals');
CREATE POLICY proposals_storage_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'proposals' AND has_role(auth.uid(), 'hq_admin'::app_role));
