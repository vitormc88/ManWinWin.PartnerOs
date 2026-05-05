
CREATE TABLE public.partnership_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partnership_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY partnership_levels_select ON public.partnership_levels
  FOR SELECT TO authenticated USING (true);

CREATE POLICY partnership_levels_insert ON public.partnership_levels
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'hq_admin'::app_role));

CREATE POLICY partnership_levels_update ON public.partnership_levels
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'hq_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'hq_admin'::app_role));

CREATE POLICY partnership_levels_delete ON public.partnership_levels
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'hq_admin'::app_role));

CREATE TRIGGER partnership_levels_set_updated_at
  BEFORE UPDATE ON public.partnership_levels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.partnership_levels (name, code, sort_order) VALUES
  ('Reseller', 'RESELLER', 10),
  ('Implementer', 'IMPLEMENTER', 20),
  ('Integrator', 'INTEGRATOR', 30),
  ('Strategic Partner', 'STRATEGIC_PARTNER', 40);

-- Sequence for global partner code numbering
CREATE SEQUENCE IF NOT EXISTS public.partner_code_seq START 1;
