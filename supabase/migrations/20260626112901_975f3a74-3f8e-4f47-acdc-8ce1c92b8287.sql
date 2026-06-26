
-- =========================================================================
-- SPRINT 1: CLIENTS & LICENSES — ADDITIVE DATA FOUNDATION
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. UUID hygiene for partner links
-- -------------------------------------------------------------------------
ALTER TABLE public.clients  ADD COLUMN IF NOT EXISTS partner_uuid uuid;
ALTER TABLE public.renewals ADD COLUMN IF NOT EXISTS partner_uuid uuid;

-- Backfill from text partner_id where valid UUID
UPDATE public.clients
   SET partner_uuid = partner_id::uuid
 WHERE partner_uuid IS NULL
   AND partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND EXISTS (SELECT 1 FROM public.partners p WHERE p.id::text = clients.partner_id);

UPDATE public.renewals
   SET partner_uuid = partner_id::uuid
 WHERE partner_uuid IS NULL
   AND partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND EXISTS (SELECT 1 FROM public.partners p WHERE p.id::text = renewals.partner_id);

-- FKs (only after backfill; SET NULL on delete to preserve history)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_partner_uuid_fkey') THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_partner_uuid_fkey
      FOREIGN KEY (partner_uuid) REFERENCES public.partners(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'renewals_partner_uuid_fkey') THEN
    ALTER TABLE public.renewals
      ADD CONSTRAINT renewals_partner_uuid_fkey
      FOREIGN KEY (partner_uuid) REFERENCES public.partners(id) ON DELETE SET NULL;
  END IF;
END $$;

-- -------------------------------------------------------------------------
-- 2. Account manager UUID fields on clients
-- -------------------------------------------------------------------------
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS account_manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_owner_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- -------------------------------------------------------------------------
-- 3. Catalog tables: modules_catalog & plugins_catalog
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.modules_catalog (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text UNIQUE,
  name        text NOT NULL,
  category    text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.modules_catalog TO authenticated;
GRANT ALL ON public.modules_catalog TO service_role;
ALTER TABLE public.modules_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "modules_catalog_read_active" ON public.modules_catalog;
CREATE POLICY "modules_catalog_read_active" ON public.modules_catalog
  FOR SELECT TO authenticated
  USING (is_active OR public.has_role(auth.uid(), 'hq_admin'::app_role));

DROP POLICY IF EXISTS "modules_catalog_hq_manage" ON public.modules_catalog;
CREATE POLICY "modules_catalog_hq_manage" ON public.modules_catalog
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'hq_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'hq_admin'::app_role));

CREATE TABLE IF NOT EXISTS public.plugins_catalog (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text UNIQUE,
  name        text NOT NULL,
  category    text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plugins_catalog TO authenticated;
GRANT ALL ON public.plugins_catalog TO service_role;
ALTER TABLE public.plugins_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plugins_catalog_read_active" ON public.plugins_catalog;
CREATE POLICY "plugins_catalog_read_active" ON public.plugins_catalog
  FOR SELECT TO authenticated
  USING (is_active OR public.has_role(auth.uid(), 'hq_admin'::app_role));

DROP POLICY IF EXISTS "plugins_catalog_hq_manage" ON public.plugins_catalog;
CREATE POLICY "plugins_catalog_hq_manage" ON public.plugins_catalog
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'hq_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'hq_admin'::app_role));

-- Seed catalog with the canonical names already used in code/data
INSERT INTO public.modules_catalog (name, category) VALUES
  ('Maintenance Module',    'core'),
  ('Maintenance Requests',  'core'),
  ('Stock Management',      'core'),
  ('Purchase Orders',       'core')
ON CONFLICT DO NOTHING;

INSERT INTO public.plugins_catalog (name, category) VALUES
  ('SLA',              'plugin'),
  ('Workflow',         'plugin'),
  ('Advanced Reports', 'plugin'),
  ('Import Tool',      'plugin'),
  ('API',              'plugin')
ON CONFLICT DO NOTHING;

-- -------------------------------------------------------------------------
-- 4. Extend licensed_modules
-- -------------------------------------------------------------------------
ALTER TABLE public.licensed_modules
  ADD COLUMN IF NOT EXISTS module_id          uuid REFERENCES public.modules_catalog(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plugin_id          uuid REFERENCES public.plugins_catalog(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS item_type          text,
  ADD COLUMN IF NOT EXISTS quantity           numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit_price         numeric,
  ADD COLUMN IF NOT EXISTS included_in_base   boolean NOT NULL DEFAULT false;

-- Backfill: match by name → modules first, then plugins
UPDATE public.licensed_modules lm
   SET module_id = mc.id,
       item_type = COALESCE(lm.item_type, 'module')
  FROM public.modules_catalog mc
 WHERE lm.module_id IS NULL
   AND lower(btrim(lm.module_name)) = lower(btrim(mc.name));

UPDATE public.licensed_modules lm
   SET plugin_id = pc.id,
       item_type = COALESCE(lm.item_type, 'plugin')
  FROM public.plugins_catalog pc
 WHERE lm.plugin_id IS NULL
   AND lm.module_id IS NULL
   AND lower(btrim(lm.module_name)) = lower(btrim(pc.name));

-- -------------------------------------------------------------------------
-- 5. Extend licenses as true LIC entities
-- -------------------------------------------------------------------------
ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS lic_code                text,
  ADD COLUMN IF NOT EXISTS lic_serial              text,
  ADD COLUMN IF NOT EXISTS edition                 text,
  ADD COLUMN IF NOT EXISTS environment             text,
  ADD COLUMN IF NOT EXISTS license_status          text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deployment_type         text,
  ADD COLUMN IF NOT EXISTS currency                text NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS previous_license_id     uuid REFERENCES public.licenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS replaced_by_license_id  uuid REFERENCES public.licenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proposal_id             uuid,
  ADD COLUMN IF NOT EXISTS deal_id                 uuid,
  ADD COLUMN IF NOT EXISTS contract_id             uuid REFERENCES public.contracts(id) ON DELETE SET NULL;

-- -------------------------------------------------------------------------
-- 6. contract_lines
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contract_lines (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id         uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  client_id           uuid NOT NULL REFERENCES public.clients(id)   ON DELETE CASCADE,
  line_type           text NOT NULL,
  description         text NOT NULL,
  related_license_id  uuid REFERENCES public.licenses(id)         ON DELETE SET NULL,
  related_module_id   uuid REFERENCES public.modules_catalog(id)  ON DELETE SET NULL,
  related_plugin_id   uuid REFERENCES public.plugins_catalog(id)  ON DELETE SET NULL,
  amount              numeric NOT NULL DEFAULT 0,
  currency            text NOT NULL DEFAULT 'EUR',
  billing_frequency   text,
  start_date          date,
  end_date            date,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_lines TO authenticated;
GRANT ALL ON public.contract_lines TO service_role;
ALTER TABLE public.contract_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contract_lines_view" ON public.contract_lines;
CREATE POLICY "contract_lines_view" ON public.contract_lines
  FOR SELECT TO authenticated
  USING (public.can_view_client(client_id));

DROP POLICY IF EXISTS "contract_lines_manage" ON public.contract_lines;
CREATE POLICY "contract_lines_manage" ON public.contract_lines
  FOR ALL TO authenticated
  USING (public.can_manage_client(client_id))
  WITH CHECK (public.can_manage_client(client_id));

CREATE TRIGGER trg_contract_lines_updated_at
  BEFORE UPDATE ON public.contract_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -------------------------------------------------------------------------
-- 7. Backfill contract_lines from existing contracts (idempotent)
-- -------------------------------------------------------------------------
INSERT INTO public.contract_lines (contract_id, client_id, line_type, description, amount, currency, start_date, end_date)
SELECT c.id, c.client_id, 'license', 'Core license', c.contract_value, COALESCE(c.currency, 'EUR'), c.contract_start_date, c.contract_end_date
  FROM public.contracts c
 WHERE COALESCE(c.contract_value, 0) > 0
   AND NOT EXISTS (SELECT 1 FROM public.contract_lines cl WHERE cl.contract_id = c.id AND cl.line_type = 'license');

INSERT INTO public.contract_lines (contract_id, client_id, line_type, description, amount, currency, start_date, end_date)
SELECT c.id, c.client_id, 'hosting', 'Hosting', c.hosting_value, COALESCE(c.currency, 'EUR'), c.contract_start_date, c.contract_end_date
  FROM public.contracts c
 WHERE COALESCE(c.hosting_value, 0) > 0
   AND NOT EXISTS (SELECT 1 FROM public.contract_lines cl WHERE cl.contract_id = c.id AND cl.line_type = 'hosting');

INSERT INTO public.contract_lines (contract_id, client_id, line_type, description, amount, currency, start_date, end_date)
SELECT c.id, c.client_id, 'mww_web', 'ManWinWin Web', c.mww_web_value, COALESCE(c.currency, 'EUR'), c.contract_start_date, c.contract_end_date
  FROM public.contracts c
 WHERE COALESCE(c.mww_web_value, 0) > 0
   AND NOT EXISTS (SELECT 1 FROM public.contract_lines cl WHERE cl.contract_id = c.id AND cl.line_type = 'mww_web');

INSERT INTO public.contract_lines (contract_id, client_id, line_type, description, amount, currency, start_date, end_date)
SELECT c.id, c.client_id, 'sat', 'S&AT', c.sat_value, COALESCE(c.currency, 'EUR'), c.contract_start_date, c.contract_end_date
  FROM public.contracts c
 WHERE COALESCE(c.sat_value, 0) > 0
   AND NOT EXISTS (SELECT 1 FROM public.contract_lines cl WHERE cl.contract_id = c.id AND cl.line_type = 'sat');

-- -------------------------------------------------------------------------
-- 8. Unified target on renewals
-- -------------------------------------------------------------------------
ALTER TABLE public.renewals
  ADD COLUMN IF NOT EXISTS target_type text,
  ADD COLUMN IF NOT EXISTS target_id   uuid;

UPDATE public.renewals
   SET target_type = 'license', target_id = license_id
 WHERE target_type IS NULL AND license_id IS NOT NULL
   AND (renewal_type ILIKE '%license%' OR renewal_type ILIKE '%sat%' OR renewal_type ILIKE '%s&at%' OR renewal_type ILIKE '%renewal%');

UPDATE public.renewals
   SET target_type = 'contract', target_id = contract_id
 WHERE target_type IS NULL AND contract_id IS NOT NULL
   AND renewal_type ILIKE '%contract%';

-- -------------------------------------------------------------------------
-- 9. Indexes
-- -------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_clients_partner_uuid          ON public.clients(partner_uuid);
CREATE INDEX IF NOT EXISTS idx_renewals_partner_uuid         ON public.renewals(partner_uuid);
CREATE INDEX IF NOT EXISTS idx_licenses_client_id            ON public.licenses(client_id);
CREATE INDEX IF NOT EXISTS idx_licenses_contract_id          ON public.licenses(contract_id);
CREATE INDEX IF NOT EXISTS idx_licensed_modules_license_id   ON public.licensed_modules(license_id);
CREATE INDEX IF NOT EXISTS idx_licensed_modules_module_id    ON public.licensed_modules(module_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client_id           ON public.contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contract_lines_contract_id    ON public.contract_lines(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_lines_client_id      ON public.contract_lines(client_id);
CREATE INDEX IF NOT EXISTS idx_contract_lines_license_id     ON public.contract_lines(related_license_id);
CREATE INDEX IF NOT EXISTS idx_renewals_target               ON public.renewals(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_renewals_renewal_date         ON public.renewals(renewal_date);
