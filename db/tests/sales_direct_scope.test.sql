-- Sales Sprint 1 rule tests. Runs in a single transaction and ROLLS BACK (no persistent changes).
-- Uses only existing draft identities: A = demo (hq_admin -> manager oversight), B = viktor (partner_admin),
-- temporarily re-profiled inside the transaction to simulate an HQ seller / inactive HQ / partner.
\set ON_ERROR_STOP 1
BEGIN;
CREATE TEMP TABLE r(name text, ok boolean);
CREATE FUNCTION pg_temp.act(_uid text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claims', CASE WHEN _uid IS NULL THEN '' ELSE json_build_object('sub',_uid,'role','authenticated')::text END, true) $$;
CREATE FUNCTION pg_temp.v(_uid text,_d uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT pg_temp.act(_uid) IS NOT NULL AND can_view_deal(_d) $$;
CREATE FUNCTION pg_temp.m(_uid text,_d uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT pg_temp.act(_uid) IS NOT NULL AND can_manage_deal(_d) $$;
CREATE FUNCTION pg_temp.fails(_sql text) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN EXECUTE _sql; RETURN false; EXCEPTION WHEN others THEN RETURN true; END $$;
\set M '''00000000-0000-4000-8000-000000000001'''
\set S '''00000000-0000-4000-8000-000000000002'''
SELECT pg_temp.act(NULL);
INSERT INTO deals(id,company_name,stage,status,sales_engine,assigned_user_id) VALUES ('0f000000-0000-4000-8000-0000000000bb','QA Direct — owned by M','Qualified','Open','new_business',:M),('0f000000-0000-4000-8000-0000000000cc','QA Direct — owned by S','Qualified','Open','new_business',:S);
-- Partner B with Sales permission accidentally granted: still zero Direct access
INSERT INTO user_module_permissions(user_id,module_key,access_level,is_override) VALUES (:S,'sales','admin',true);
INSERT INTO r VALUES ('partner with sales perm has no capability', NOT pg_temp.v(:S,'0f000000-0000-4000-8000-0000000000cc'));
INSERT INTO r VALUES ('partner cannot view direct deal', NOT pg_temp.v(:S,'0f000000-0000-4000-8000-0000000000cc'));
INSERT INTO r VALUES ('partner scope preserved', (SELECT partner_id IS NULL OR pg_temp.v(:S,'08000000-0000-4000-8000-000000000001') FROM deals WHERE id='08000000-0000-4000-8000-000000000001'));
INSERT INTO r VALUES ('hq admin = manager oversight', pg_temp.m(:M,'0f000000-0000-4000-8000-0000000000cc'));
-- Turn B into an internal HQ seller (edit)
UPDATE user_module_permissions SET access_level='edit' WHERE user_id=:S AND module_key='sales';
UPDATE profiles SET is_hq=true, partner_id=NULL WHERE id=:S;
UPDATE user_roles SET role='hq_standard' WHERE user_id=:S;
INSERT INTO r VALUES ('seller capability edit', pg_temp.m(:S,'0f000000-0000-4000-8000-0000000000cc'));
INSERT INTO r VALUES ('seller sees own', pg_temp.v(:S,'0f000000-0000-4000-8000-0000000000cc'));
INSERT INTO r VALUES ('seller cannot see other seller', NOT pg_temp.v(:S,'0f000000-0000-4000-8000-0000000000bb'));
SELECT pg_temp.act(:S);
INSERT INTO deals(id,company_name,stage,status,sales_engine) VALUES ('0f000000-0000-4000-8000-0000000000aa','QA Direct — test','Qualified','Open','new_business');
INSERT INTO r SELECT 'seller insert defaults owner to self', assigned_user_id=:S FROM deals WHERE id='0f000000-0000-4000-8000-0000000000aa';
INSERT INTO r VALUES ('seller cannot insert for other', pg_temp.fails($q$INSERT INTO deals(company_name,stage,status,sales_engine,assigned_user_id) VALUES ('x','Qualified','Open','new_business','00000000-0000-4000-8000-000000000001')$q$));
INSERT INTO r VALUES ('seller cannot reassign owner', pg_temp.fails($q$UPDATE deals SET assigned_user_id='00000000-0000-4000-8000-000000000001' WHERE id='0f000000-0000-4000-8000-0000000000aa'$q$));
INSERT INTO r VALUES ('seller cannot change engine', pg_temp.fails($q$UPDATE deals SET sales_engine='partner' WHERE id='0f000000-0000-4000-8000-0000000000aa'$q$));
INSERT INTO r VALUES ('seller cannot attach partner', pg_temp.fails($q$UPDATE deals SET partner_id='03000000-0000-4000-8000-000000000001' WHERE id='0f000000-0000-4000-8000-0000000000aa'$q$));
INSERT INTO r VALUES ('seller can edit own stage', NOT pg_temp.fails($q$UPDATE deals SET stage='Proposal' WHERE id='0f000000-0000-4000-8000-0000000000aa'$q$));
INSERT INTO r VALUES ('direct Won blocked', pg_temp.fails($q$UPDATE deals SET stage='Won', status='Won' WHERE id='0f000000-0000-4000-8000-0000000000aa'$q$));
SELECT pg_temp.act(:M);
INSERT INTO r VALUES ('manager Won blocked', pg_temp.fails($q$UPDATE deals SET stage='Won', status='Won' WHERE id='0f000000-0000-4000-8000-0000000000aa'$q$));
INSERT INTO r VALUES ('manager can reassign to eligible', NOT pg_temp.fails($q$UPDATE deals SET assigned_user_id='00000000-0000-4000-8000-000000000001' WHERE id='0f000000-0000-4000-8000-0000000000aa'$q$));
UPDATE user_module_permissions SET access_level='no_access' WHERE user_id=:S AND module_key='sales';
INSERT INTO r VALUES ('manager cannot assign to non-sales HQ', pg_temp.fails($q$UPDATE deals SET assigned_user_id='00000000-0000-4000-8000-000000000002' WHERE id='0f000000-0000-4000-8000-0000000000aa'$q$));
INSERT INTO r VALUES ('HQ without Sales has no direct access', NOT pg_temp.v(:S,'0f000000-0000-4000-8000-0000000000cc'));
INSERT INTO r VALUES ('HQ without Sales keeps partner-deal access', pg_temp.v(:S,'08000000-0000-4000-8000-000000000001'));
UPDATE user_module_permissions SET access_level='edit' WHERE user_id=:S AND module_key='sales';
UPDATE profiles SET is_active=false WHERE id=:S;
INSERT INTO r VALUES ('inactive HQ seller has no direct access', NOT pg_temp.v(:S,'0f000000-0000-4000-8000-0000000000cc'));
INSERT INTO r VALUES ('legacy NULL engine never treated as direct', pg_temp.v(:M,'08000000-0000-4000-8000-000000000001'));
SELECT name, ok FROM r ORDER BY ok, name;
SELECT CASE WHEN bool_and(ok) THEN 'ALL PASS ('||count(*)||')' ELSE 'FAILURES' END FROM r;
ROLLBACK;
