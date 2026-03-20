
-- Deals / Opportunities table
CREATE TABLE public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id text,
  company_name text NOT NULL,
  country text,
  industry text,
  lead_source text DEFAULT 'Partner',
  stage text NOT NULL DEFAULT 'Lead',
  expected_value numeric DEFAULT 0,
  total_value numeric DEFAULT 0,
  probability integer DEFAULT 10,
  expected_close_date date,
  assigned_salesperson text,
  description text,
  notes text,
  status text NOT NULL DEFAULT 'Open',
  aging_days integer DEFAULT 0,
  last_activity_at timestamp with time zone DEFAULT now(),
  stage_entered_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to deals" ON public.deals FOR ALL TO public USING (true) WITH CHECK (true);

-- Deal contacts
CREATE TABLE public.deal_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  contact_name text NOT NULL,
  role text,
  email text,
  phone text,
  is_decision_maker boolean DEFAULT false,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.deal_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to deal_contacts" ON public.deal_contacts FOR ALL TO public USING (true) WITH CHECK (true);

-- Deal tasks
CREATE TABLE public.deal_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  assigned_to text,
  due_date date,
  is_completed boolean DEFAULT false,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.deal_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to deal_tasks" ON public.deal_tasks FOR ALL TO public USING (true) WITH CHECK (true);

-- Deal activities / communications log
CREATE TABLE public.deal_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  activity_type text NOT NULL DEFAULT 'note',
  subject text,
  description text,
  performed_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.deal_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to deal_activities" ON public.deal_activities FOR ALL TO public USING (true) WITH CHECK (true);

-- Deal registrations (approval workflow)
CREATE TABLE public.deal_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  partner_id text NOT NULL,
  registration_status text NOT NULL DEFAULT 'Pending',
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  reviewed_by text,
  rejection_reason text,
  conflict_deal_id uuid REFERENCES public.deals(id),
  notes text
);
ALTER TABLE public.deal_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to deal_registrations" ON public.deal_registrations FOR ALL TO public USING (true) WITH CHECK (true);

-- Commissions
CREATE TABLE public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  partner_id text NOT NULL,
  commission_type text NOT NULL DEFAULT 'New Business',
  software_revenue numeric DEFAULT 0,
  services_revenue numeric DEFAULT 0,
  partner_margin_pct numeric DEFAULT 0,
  commission_value numeric DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'Pending',
  approved_at timestamp with time zone,
  paid_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to commissions" ON public.commissions FOR ALL TO public USING (true) WITH CHECK (true);
