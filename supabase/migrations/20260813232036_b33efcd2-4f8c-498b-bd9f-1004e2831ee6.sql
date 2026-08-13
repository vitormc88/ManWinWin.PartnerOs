-- ── ZZVP0 verification run (TEST ENVIRONMENT ONLY) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.zzv_p0_results (
  step text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.zzv_p0_results ENABLE ROW LEVEL SECURITY;
TRUNCATE public.zzv_p0_results;

-- Fixtures ------------------------------------------------------------------
DO $fx$
DECLARE
  pa uuid := '0d00aaaa-0000-4000-8000-00000000000a';
  pb uuid := '0d00bbbb-0000-4000-8000-00000000000b';
  ca uuid := '0c00aaaa-0000-4000-8000-00000000000a';
  cb uuid := '0c00bbbb-0000-4000-8000-00000000000b';
  ua uuid := '0a00aaaa-0000-4000-8000-00000000000a';
  ub uuid := '0a00bbbb-0000-4000-8000-00000000000b';
BEGIN
  INSERT INTO public.partners (id, partner_code, company_name, country)
  VALUES (pa, 'ZZVP0-A', 'ZZVP0 Synthetic Partner A', 'PT'),
         (pb, 'ZZVP0-B', 'ZZVP0 Synthetic Partner B', 'PT')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.clients (id, client_code, commercial_name, partner_id, partner_uuid, country)
  VALUES (ca, 'ZZVP0-CA', 'ZZVP0 Synthetic Client A', pa::text, pa, 'PT'),
         (cb, 'ZZVP0-CB', 'ZZVP0 Synthetic Client B', pb::text, pb, 'PT')
  ON CONFLICT (id) DO NOTHING;

  -- Temporary test users (removed in cleanup).
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  VALUES ('00000000-0000-0000-0000-000000000000', ua, 'authenticated', 'authenticated',
          'zzvp0.partnera@example.invalid', 'zzvp0-not-a-real-password',
          now(), '{"provider":"email","providers":["email"]}'::jsonb,
          '{"full_name":"ZZVP0 Partner A User"}'::jsonb, now(), now()),
         ('00000000-0000-0000-0000-000000000000', ub, 'authenticated', 'authenticated',
          'zzvp0.hq@example.invalid', 'zzvp0-not-a-real-password',
          now(), '{"provider":"email","providers":["email"]}'::jsonb,
          '{"full_name":"ZZVP0 HQ User"}'::jsonb, now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, full_name, email, partner_id, is_hq, is_active)
  VALUES (ua, 'ZZVP0 Partner A User', 'zzvp0.partnera@example.invalid', pa, false, true),
         (ub, 'ZZVP0 HQ User', 'zzvp0.hq@example.invalid', NULL, true, true)
  ON CONFLICT (id) DO UPDATE
    SET partner_id = EXCLUDED.partner_id, is_hq = EXCLUDED.is_hq, is_active = true;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (ua, 'partner_admin'), (ub, 'hq_admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.zzv_p0_results(step, passed, detail)
  VALUES ('00_fixtures', true, 'Synthetic partners A/B, clients A/B and 2 temporary users created');
END
$fx$;

-- 1. HQ lifecycle: create → reopen → re-save (no duplicated items) -----------
DO $hq$
DECLARE
  orig text := current_user;
  ub uuid := '0a00bbbb-0000-4000-8000-00000000000b';
  ca uuid := '0c00aaaa-0000-4000-8000-00000000000a';
  pid uuid;
  n_items int;
  n_after int;
  reread record;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', ub::text, 'role', 'authenticated')::text, true);

  INSERT INTO public.proposals (
    source_type, client_id, partner_uuid, client_name, project_name, status,
    product_family, plan, source_plan, target_plan, renewal_change_mode,
    web_users, total_recurring, implementation_gross, implementation_net,
    implementation_discount_amount, total_year_1, entitlements
  ) VALUES (
    'client', ca, '0d00aaaa-0000-4000-8000-00000000000a',
    'ZZVP0 Synthetic Client A', 'ZZVP0 upgrade Professional 1 to 3', 'Draft',
    'Professional', 3, 1, 3, 'upgrade',
    4, 2520, 1650, 825, 825, 3345,
    '{"backoffice_total":1,"web_total":4,"web_included":1,"web_billable":3}'::jsonb
  ) RETURNING id INTO pid;

  INSERT INTO public.proposal_items (proposal_id, category, item_name, qty, unit_price, frequency,
                                     total, gross_total, net_total, is_recurring, sort_order)
  VALUES (pid, 'software', 'Professional 3 annual licence', 1, 1800, 'annual', 1800, 1800, 1800, true, 0),
         (pid, 'software', 'Web accesses (3 billable)', 3, 240, 'annual', 720, 720, 720, true, 1),
         (pid, 'services', 'Implementation (50% discount)', 1, 1650, 'one-time', 1650, 1650, 825, false, 2);

  -- Reopen (exactly what the UI does)
  SELECT p.status, p.total_recurring, p.total_year_1, p.implementation_net
    INTO reread
  FROM public.proposals p WHERE p.id = pid;
  SELECT count(*) INTO n_items FROM public.proposal_items WHERE proposal_id = pid;

  -- Re-save: delete + reinsert items, exactly as the dialog does
  UPDATE public.proposals SET project_name = project_name || ' (edited)' WHERE id = pid;
  DELETE FROM public.proposal_items WHERE proposal_id = pid;
  INSERT INTO public.proposal_items (proposal_id, category, item_name, qty, unit_price, frequency,
                                     total, gross_total, net_total, is_recurring, sort_order)
  VALUES (pid, 'software', 'Professional 3 annual licence', 1, 1800, 'annual', 1800, 1800, 1800, true, 0),
         (pid, 'software', 'Web accesses (3 billable)', 3, 240, 'annual', 720, 720, 720, true, 1),
         (pid, 'services', 'Implementation (50% discount)', 1, 1650, 'one-time', 1650, 1650, 825, false, 2);
  SELECT count(*) INTO n_after FROM public.proposal_items WHERE proposal_id = pid;

  EXECUTE format('SET LOCAL ROLE %I', orig);

  INSERT INTO public.zzv_p0_results(step, passed, detail) VALUES
    ('01_hq_create_reopen_resave',
     (reread.status = 'Draft' AND n_items = 3 AND n_after = 3),
     format('proposal=%s status=%s items_after_create=%s items_after_resave=%s recurring=%s year1=%s onetime=%s',
            pid, reread.status, n_items, n_after, reread.total_recurring, reread.total_year_1, reread.implementation_net));
END
$hq$;

-- 2. Same-partner lifecycle + 3. cross-partner denial ------------------------
DO $pt$
DECLARE
  orig text := current_user;
  ua uuid := '0a00aaaa-0000-4000-8000-00000000000a';
  ca uuid := '0c00aaaa-0000-4000-8000-00000000000a';
  cb uuid := '0c00bbbb-0000-4000-8000-00000000000b';
  pa uuid := '0d00aaaa-0000-4000-8000-00000000000a';
  pb uuid := '0d00bbbb-0000-4000-8000-00000000000b';
  pid uuid;
  own record;
  n_items int;
  hq_pid uuid;
  create_denied boolean := false;
  read_count int;
  update_count int;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', ua::text, 'role', 'authenticated')::text, true);

  -- own partner client: create
  INSERT INTO public.proposals (source_type, client_id, partner_uuid, client_name, project_name,
                                status, product_family, plan, total_recurring, total_year_1)
  VALUES ('client', ca, pa, 'ZZVP0 Synthetic Client A', 'ZZVP0 partner-owned action',
          'Draft', 'Professional', 1, 1000, 1500)
  RETURNING id INTO pid;

  INSERT INTO public.proposal_items (proposal_id, category, item_name, qty, unit_price, frequency,
                                     total, gross_total, net_total, is_recurring, sort_order)
  VALUES (pid, 'software', 'ZZVP0 line', 1, 1000, 'annual', 1000, 1000, 1000, true, 0);

  -- reopen
  SELECT p.id, p.created_by, p.partner_uuid, p.client_id INTO own
  FROM public.proposals p WHERE p.id = pid;
  SELECT count(*) INTO n_items FROM public.proposal_items WHERE proposal_id = pid;

  -- cross-partner: CREATE must be denied
  BEGIN
    INSERT INTO public.proposals (source_type, client_id, partner_uuid, client_name, status,
                                  product_family, plan)
    VALUES ('client', cb, pb, 'ZZVP0 Synthetic Client B', 'Draft', 'Professional', 1);
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    create_denied := true;
  END;

  -- cross-partner: READ (HQ-created proposal on client A is visible; on client B must not be)
  SELECT count(*) INTO read_count FROM public.proposals WHERE client_id = cb;

  -- cross-partner: UPDATE
  UPDATE public.proposals SET project_name = 'hijacked' WHERE client_id = cb;
  GET DIAGNOSTICS update_count = ROW_COUNT;

  EXECUTE format('SET LOCAL ROLE %I', orig);

  INSERT INTO public.zzv_p0_results(step, passed, detail) VALUES
    ('02_same_partner_lifecycle',
     (own.created_by = ua AND own.partner_uuid = pa AND own.client_id = ca AND n_items = 1),
     format('proposal=%s created_by=%s partner_uuid=%s client_id=%s items=%s',
            own.id, own.created_by, own.partner_uuid, own.client_id, n_items)),
    ('03_cross_partner_denied',
     (create_denied AND read_count = 0 AND update_count = 0),
     format('create_denied=%s rows_readable=%s rows_updated=%s', create_denied, read_count, update_count));
END
$pt$;

-- 4. Save / reopen fidelity of the synthetic upgrade -------------------------
DO $fid$
DECLARE
  orig text := current_user;
  ub uuid := '0a00bbbb-0000-4000-8000-00000000000b';
  ca uuid := '0c00aaaa-0000-4000-8000-00000000000a';
  p record;
  sw numeric; web numeric; impl numeric;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', ub::text, 'role', 'authenticated')::text, true);

  SELECT * INTO p FROM public.proposals
   WHERE client_id = ca AND project_name LIKE 'ZZVP0 upgrade%' LIMIT 1;

  SELECT net_total INTO sw   FROM public.proposal_items WHERE proposal_id = p.id AND sort_order = 0;
  SELECT net_total INTO web  FROM public.proposal_items WHERE proposal_id = p.id AND sort_order = 1;
  SELECT net_total INTO impl FROM public.proposal_items WHERE proposal_id = p.id AND sort_order = 2;

  EXECUTE format('SET LOCAL ROLE %I', orig);

  INSERT INTO public.zzv_p0_results(step, passed, detail) VALUES
    ('04_reopen_fidelity',
     (p.source_plan = 1 AND p.target_plan = 3
      AND (p.entitlements->>'backoffice_total')::int = 1
      AND (p.entitlements->>'web_total')::int = 4
      AND (p.entitlements->>'web_included')::int = 1
      AND (p.entitlements->>'web_billable')::int = 3
      AND sw = 1800 AND web = 720 AND p.total_recurring = 2520
      AND p.implementation_gross = 1650 AND impl = 825
      AND p.implementation_net = 825 AND p.total_year_1 = 3345),
     format('plan %s→%s bo=%s web_total=%s incl=%s billable=%s sw=%s web=%s recurring=%s impl_gross=%s impl_net=%s year1=%s',
            p.source_plan, p.target_plan,
            p.entitlements->>'backoffice_total', p.entitlements->>'web_total',
            p.entitlements->>'web_included', p.entitlements->>'web_billable',
            sw, web, p.total_recurring, p.implementation_gross, impl, p.total_year_1));
END
$fid$;

-- 6. Production-shaped revenue-history migration simulation ------------------
DO $sim$
DECLARE
  cols int; rows_before int; rows_after int; amount_before numeric; amount_after numeric; dup int;
BEGIN
  DROP SCHEMA IF EXISTS zzv_sim CASCADE;
  CREATE SCHEMA zzv_sim;

  CREATE TABLE zzv_sim.client_revenue_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    revenue_type text NOT NULL,
    amount numeric NOT NULL,
    currency text NOT NULL DEFAULT 'EUR',
    revenue_date date NOT NULL,
    source text NOT NULL DEFAULT 'manual',
    source_reference text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT crh_client_source_ref_key UNIQUE (client_id, source_reference)
  );

  INSERT INTO zzv_sim.client_revenue_history (client_id, revenue_type, amount, revenue_date, source, source_reference)
  VALUES ('0c00aaaa-0000-4000-8000-00000000000a', 'renewal', 2520, current_date, 'renewal_closure', 'renewal:legacy-1');

  SELECT count(*), sum(amount) INTO rows_before, amount_before FROM zzv_sim.client_revenue_history;

  -- compatibility migration, applied twice (idempotency)
  FOR i IN 1..2 LOOP
    ALTER TABLE zzv_sim.client_revenue_history ADD COLUMN IF NOT EXISTS contract_id uuid;
    ALTER TABLE zzv_sim.client_revenue_history ADD COLUMN IF NOT EXISTS renewal_id uuid;
    ALTER TABLE zzv_sim.client_revenue_history ADD COLUMN IF NOT EXISTS proposal_id uuid;
  END LOOP;

  SELECT count(*) INTO cols FROM information_schema.columns
   WHERE table_schema = 'zzv_sim' AND table_name = 'client_revenue_history'
     AND column_name IN ('contract_id','renewal_id','proposal_id');

  -- closure + retry must use the composite key and never duplicate revenue
  FOR i IN 1..2 LOOP
    INSERT INTO zzv_sim.client_revenue_history (client_id, revenue_type, amount, revenue_date, source, source_reference, renewal_id)
    VALUES ('0c00aaaa-0000-4000-8000-00000000000a', 'renewal', 3345, current_date, 'renewal_closure', 'renewal:zzvp0-1',
            '0e00aaaa-0000-4000-8000-00000000000a')
    ON CONFLICT (client_id, source_reference) DO UPDATE SET amount = EXCLUDED.amount, updated_at = now();
  END LOOP;

  SELECT count(*), sum(amount) INTO rows_after, amount_after FROM zzv_sim.client_revenue_history;
  SELECT count(*) INTO dup FROM (
    SELECT client_id, source_reference FROM zzv_sim.client_revenue_history
    GROUP BY 1,2 HAVING count(*) > 1) d;

  INSERT INTO public.zzv_p0_results(step, passed, detail) VALUES
    ('06_prod_shaped_migration',
     (cols = 3 AND rows_after = rows_before + 1 AND dup = 0 AND amount_after = amount_before + 3345),
     format('columns_added=%s rows %s→%s amount %s→%s duplicates=%s (applied twice, retry safe)',
            cols, rows_before, rows_after, amount_before, amount_after, dup));

  DROP SCHEMA zzv_sim CASCADE;
END
$sim$;