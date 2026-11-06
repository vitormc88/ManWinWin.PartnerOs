-- Sales Module v1 / Sprint 1 — authorization acceptance gate (Direct + Partner).
-- Run as database owner AFTER applying
--   supabase/review-migrations/sales-s1/20261106140000_sales_s1_commercial_scope.sql
-- Everything runs inside one transaction and is rolled back. Synthetic data only.
--   psql -v ON_ERROR_STOP=1 -f tests/sql/sales_s1_direct_scope.sql
-- Any failed assertion raises and aborts; final line prints SALES_S1_GATE_PASS.
BEGIN;

CREATE TEMP TABLE ids(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
INSERT INTO ids VALUES
 ('sellerA',gen_random_uuid()),('sellerB',gen_random_uuid()),('manager',gen_random_uuid()),
 ('hqadmin',gen_random_uuid()),('hqnosales',gen_random_uuid()),('hqinactive',gen_random_uuid()),
 ('partnerA_user',gen_random_uuid()),('partnerB_user',gen_random_uuid()),
 ('partnerA',gen_random_uuid()),('partnerB',gen_random_uuid()),
 ('dealA',gen_random_uuid()),('dealB',gen_random_uuid()),('dealPA',gen_random_uuid()),('dealPB',gen_random_uuid()),
 ('propA',gen_random_uuid());
GRANT SELECT ON ids TO authenticated;
CREATE OR REPLACE FUNCTION pg_temp.id(_k text) RETURNS uuid LANGUAGE sql AS $$ SELECT v FROM ids WHERE k=_k $$;

INSERT INTO auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new)
SELECT v, '00000000-0000-0000-0000-000000000000','authenticated','authenticated', k||'@s1.invalid', now(), now(), now(), '', '', '', ''
FROM ids WHERE k IN ('sellerA','sellerB','manager','hqadmin','hqnosales','hqinactive','partnerA_user','partnerB_user');

INSERT INTO public.partners (id, name) VALUES (pg_temp.id('partnerA'),'ZZ S1 Partner A'),(pg_temp.id('partnerB'),'ZZ S1 Partner B');

INSERT INTO public.profiles (id, full_name, email, is_hq, is_active, partner_id)
SELECT v, k, k||'@s1.invalid',
       k NOT LIKE 'partner%', k <> 'hqinactive',
       CASE k WHEN 'partnerA_user' THEN pg_temp.id('partnerA') WHEN 'partnerB_user' THEN pg_temp.id('partnerB') END
FROM ids WHERE k IN ('sellerA','sellerB','manager','hqadmin','hqnosales','hqinactive','partnerA_user','partnerB_user')
ON CONFLICT (id) DO UPDATE SET is_hq=EXCLUDED.is_hq, is_active=EXCLUDED.is_active, partner_id=EXCLUDED.partner_id;

DELETE FROM public.user_roles WHERE user_id IN (SELECT v FROM ids);
INSERT INTO public.user_roles (user_id, role) VALUES
 (pg_temp.id('sellerA'),'hq_standard'),(pg_temp.id('sellerB'),'hq_standard'),(pg_temp.id('manager'),'hq_standard'),
 (pg_temp.id('hqadmin'),'hq_admin'),(pg_temp.id('hqnosales'),'hq_standard'),(pg_temp.id('hqinactive'),'hq_standard'),
 (pg_temp.id('partnerA_user'),'partner_admin'),(pg_temp.id('partnerB_user'),'partner_admin');

INSERT INTO public.user_module_permissions (user_id, module_key, access_level, is_override) VALUES
 (pg_temp.id('sellerA'),'sales','edit',true),(pg_temp.id('sellerB'),'sales','edit',true),
 (pg_temp.id('manager'),'sales','admin',true),(pg_temp.id('hqinactive'),'sales','admin',true),
 (pg_temp.id('partnerA_user'),'sales','admin',true);  -- accidental grant must not help

INSERT INTO public.deals (id, company_name, stage, status, sales_engine, assigned_user_id, partner_id) VALUES
 (pg_temp.id('dealA'),'ZZ S1 Direct A','New','Open','new_business',pg_temp.id('sellerA'),NULL),
 (pg_temp.id('dealB'),'ZZ S1 Direct B','New','Open','new_business',pg_temp.id('sellerB'),NULL),
 (pg_temp.id('dealPA'),'ZZ S1 Partner A deal','New','Open','partner',NULL,pg_temp.id('partnerA')::text),
 (pg_temp.id('dealPB'),'ZZ S1 Partner B deal','New','Open','partner',NULL,pg_temp.id('partnerB')::text);

INSERT INTO public.deal_tasks (deal_id, title) VALUES (pg_temp.id('dealA'),'ZZ S1 task A');
INSERT INTO public.deal_contacts (deal_id, name) VALUES (pg_temp.id('dealA'),'ZZ S1 contact A');
INSERT INTO public.deal_activities (deal_id, activity_type, description) VALUES (pg_temp.id('dealA'),'note','ZZ S1 note');
INSERT INTO public.proposals (id, deal_id, lead_id, source_type, status, title)
 VALUES (pg_temp.id('propA'), pg_temp.id('dealA'), pg_temp.id('dealA'), 'deal', 'Draft', 'ZZ S1 proposal');

CREATE OR REPLACE FUNCTION pg_temp.as_user(_k text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(_k), 'role','authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.as_owner() RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('role', 'postgres', true); END $$;
CREATE OR REPLACE FUNCTION pg_temp.check(_ok boolean, _name text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT COALESCE(_ok,false) THEN RAISE EXCEPTION 'FAIL: %', _name; END IF; RAISE NOTICE 'PASS: %', _name; END $$;
CREATE OR REPLACE FUNCTION pg_temp.visible(_deal text) RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS (SELECT 1 FROM public.deals WHERE id = pg_temp.id(_deal)) $$;
CREATE OR REPLACE FUNCTION pg_temp.fails(_sql text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN EXECUTE _sql; GET DIAGNOSTICS n = ROW_COUNT; RETURN n = 0;
EXCEPTION WHEN OTHERS THEN RETURN true; END $$;

-- ---- Direct ----
SELECT pg_temp.as_user('sellerA');
SELECT pg_temp.check(pg_temp.visible('dealA'), 'Seller A sees own Direct deal');
SELECT pg_temp.check(NOT pg_temp.visible('dealB'), 'Seller A cannot see Seller B Direct deal');
SELECT pg_temp.check(pg_temp.fails(format('UPDATE public.deals SET notes=''x'' WHERE id=%L', pg_temp.id('dealB'))), 'Seller A cannot edit Seller B deal');
SELECT pg_temp.check(NOT pg_temp.fails(format('UPDATE public.deals SET notes=''ok'' WHERE id=%L', pg_temp.id('dealA'))), 'Seller A can edit own Direct deal');
SELECT pg_temp.check(pg_temp.fails(format('UPDATE public.deals SET assigned_user_id=%L WHERE id=%L', pg_temp.id('sellerB'), pg_temp.id('dealA'))), 'Seller A cannot change owner');
SELECT pg_temp.check(pg_temp.fails(format('UPDATE public.deals SET sales_engine=''partner'' WHERE id=%L', pg_temp.id('dealA'))), 'Seller A cannot change engine');
SELECT pg_temp.check(pg_temp.fails(format('UPDATE public.deals SET sales_engine=''partner'', partner_id=%L WHERE id=%L', pg_temp.id('partnerA'), pg_temp.id('dealA'))), 'Seller A cannot move deal into partner scope');
SELECT pg_temp.check(pg_temp.fails(format('INSERT INTO public.deals(company_name,stage,status,sales_engine,assigned_user_id) VALUES (''x'',''New'',''Open'',''new_business'',%L)', pg_temp.id('sellerB'))), 'Seller A cannot create Direct deal for Seller B');
-- children
SELECT pg_temp.check(NOT EXISTS(SELECT 1 FROM public.deal_tasks WHERE deal_id=pg_temp.id('dealB')), 'children: tasks scoped');
SELECT pg_temp.check(EXISTS(SELECT 1 FROM public.proposals WHERE id=pg_temp.id('propA')), 'Seller A sees own Direct proposal');

SELECT pg_temp.as_user('sellerB');
SELECT pg_temp.check(NOT EXISTS(SELECT 1 FROM public.proposals WHERE id=pg_temp.id('propA')), 'children: proposals scoped');
SELECT pg_temp.check(NOT EXISTS(SELECT 1 FROM public.deal_contacts WHERE deal_id=pg_temp.id('dealA')), 'children: contacts scoped');
SELECT pg_temp.check(NOT EXISTS(SELECT 1 FROM public.deal_activities WHERE deal_id=pg_temp.id('dealA')), 'children: communications scoped');
SELECT pg_temp.check(NOT EXISTS(SELECT 1 FROM public.deal_tasks WHERE deal_id=pg_temp.id('dealA')), 'children: deal tasks scoped');
SELECT pg_temp.check(pg_temp.fails(format('INSERT INTO public.deal_tasks(deal_id,title) VALUES (%L,''x'')', pg_temp.id('dealA'))), 'children: cannot write into other seller deal');

SELECT pg_temp.as_user('manager');
SELECT pg_temp.check(pg_temp.visible('dealA') AND pg_temp.visible('dealB'), 'Manager sees Direct portfolio');
SELECT pg_temp.check(NOT pg_temp.fails(format('UPDATE public.deals SET assigned_user_id=%L WHERE id=%L', pg_temp.id('sellerB'), pg_temp.id('dealA'))), 'Manager can reassign to eligible seller');
SELECT pg_temp.check(pg_temp.fails(format('UPDATE public.deals SET assigned_user_id=%L WHERE id=%L', pg_temp.id('hqnosales'), pg_temp.id('dealA'))), 'Manager cannot assign to HQ without Sales');
SELECT pg_temp.check(pg_temp.fails(format('UPDATE public.deals SET assigned_user_id=%L WHERE id=%L', pg_temp.id('partnerA_user'), pg_temp.id('dealA'))), 'Manager cannot assign to Partner user');

SELECT pg_temp.as_user('hqadmin');
SELECT pg_temp.check(pg_temp.visible('dealA'), 'HQ Admin has governed Direct oversight');

SELECT pg_temp.as_user('hqnosales');
SELECT pg_temp.check(NOT pg_temp.visible('dealA') AND NOT pg_temp.visible('dealB'), 'HQ without Sales cannot see Direct');
SELECT pg_temp.check(pg_temp.visible('dealPA'), 'HQ without Sales still sees Partner deals (unchanged)');

SELECT pg_temp.as_user('hqinactive');
SELECT pg_temp.check(NOT pg_temp.visible('dealA'), 'Inactive HQ cannot see Direct');

-- ---- Partner ----
SELECT pg_temp.as_user('partnerA_user');
SELECT pg_temp.check(NOT pg_temp.visible('dealA') AND NOT pg_temp.visible('dealB'), 'Partner A has zero Direct access (even with Sales grant)');
SELECT pg_temp.check(NOT EXISTS(SELECT 1 FROM public.proposals WHERE id=pg_temp.id('propA')), 'Partner A cannot see Direct proposal');
SELECT pg_temp.check(NOT pg_temp.visible('dealPB'), 'Partner A cannot see Partner B');
SELECT pg_temp.check(pg_temp.visible('dealPA'), 'Partner A sees own Partner deal');
SELECT pg_temp.check(NOT pg_temp.fails(format('UPDATE public.deals SET notes=''ok'' WHERE id=%L', pg_temp.id('dealPA'))), 'Partner A can still edit own deal');
SELECT pg_temp.check(pg_temp.fails(format('UPDATE public.deals SET sales_engine=''new_business'', partner_id=NULL WHERE id=%L', pg_temp.id('dealPA'))), 'Partner A cannot convert deal to Direct');
SELECT pg_temp.check(pg_temp.fails(format('INSERT INTO public.deals(company_name,stage,status,sales_engine,assigned_user_id) VALUES (''x'',''New'',''Open'',''new_business'',%L)', pg_temp.id('partnerA_user'))), 'Partner A cannot create Direct deal');

-- ---- Closing interlock ----
SELECT pg_temp.as_user('manager');
SELECT pg_temp.check(pg_temp.fails(format('UPDATE public.deals SET stage=''Won'' WHERE id=%L', pg_temp.id('dealB'))), 'Direct deal cannot move to Won stage');
SELECT pg_temp.check(pg_temp.fails(format('UPDATE public.deals SET status=''Won'' WHERE id=%L', pg_temp.id('dealB'))), 'Direct deal cannot get Won status');
SELECT pg_temp.check(pg_temp.fails(format('UPDATE public.proposals SET status=''Won'' WHERE id=%L', pg_temp.id('propA'))), 'Direct proposal cannot be Won');
SELECT pg_temp.as_owner();
SELECT pg_temp.check(pg_temp.fails(format('INSERT INTO public.licenses(client_id, deal_id) SELECT id, %L FROM public.clients LIMIT 1', pg_temp.id('dealA'))) , 'Licence cannot be linked to a Direct deal');
SELECT pg_temp.check(NOT EXISTS(SELECT 1 FROM public.licenses WHERE deal_id IN (pg_temp.id('dealA'),pg_temp.id('dealB'))), 'No downstream licence created for Direct');
SELECT pg_temp.check(NOT EXISTS(SELECT 1 FROM public.deals WHERE id IN (pg_temp.id('dealA'),pg_temp.id('dealB')) AND (stage='Won' OR status='Won')), 'No Direct deal reached Won');

SELECT 'SALES_S1_GATE_PASS';
ROLLBACK;
