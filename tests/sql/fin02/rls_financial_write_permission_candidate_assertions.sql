-- TEST-only prospective finance-write RLS candidate verification.
-- Uses real TEST auth helper bodies and role templates + fake tenant rows.
-- Executed solely in disposable PostgreSQL, in a rollback-only transaction.
BEGIN;
SET LOCAL ROLE authenticated;
DO $financial_candidate$
DECLARE
  _n integer;
  _err boolean;
  _a uuid:='00000000-0000-4000-8000-000000000301';
  _b uuid:='00000000-0000-4000-8000-000000000302';
BEGIN
 -- Partner Sales A may SELECT own financial records but lacks module edits.
 PERFORM set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000004',true);
 IF public.has_module_access('clients','edit')
     OR public.has_module_access('renewals','edit') THEN
   RAISE EXCEPTION 'FIN02_SALES_ROLE_TEST_FIXTURE_DRIFT';
 END IF;
 UPDATE public.licenses SET notes=notes WHERE client_id=_a;
 GET DIAGNOSTICS _n=ROW_COUNT;
 IF _n<>0 THEN RAISE EXCEPTION 'FIN02_VIEW_ONLY_LICENSE_WRITE_ALLOWED'; END IF;
 UPDATE public.contracts SET observations=observations WHERE client_id=_a;
 GET DIAGNOSTICS _n=ROW_COUNT;
 IF _n<>0 THEN RAISE EXCEPTION 'FIN02_VIEW_ONLY_CONTRACT_WRITE_ALLOWED'; END IF;
 UPDATE public.renewals SET notes=notes WHERE client_id=_a;
 GET DIAGNOSTICS _n=ROW_COUNT;
 IF _n<>0 THEN RAISE EXCEPTION 'FIN02_NO_ACCESS_RENEWAL_WRITE_ALLOWED'; END IF;

 _err:=false;
 BEGIN
   INSERT INTO public.contracts(id,client_id)
   VALUES('00000000-0000-4000-8000-000000000298',_a);
 EXCEPTION WHEN insufficient_privilege THEN _err:=true;
 END;
 IF NOT _err THEN RAISE EXCEPTION 'FIN02_VIEW_ONLY_CONTRACT_INSERT_ALLOWED'; END IF;
 _err:=false;
 BEGIN
   INSERT INTO public.licenses(id,client_id)
   VALUES('00000000-0000-4000-8000-000000000898',_a);
 EXCEPTION WHEN insufficient_privilege THEN _err:=true;
 END;
 IF NOT _err THEN RAISE EXCEPTION 'FIN02_VIEW_ONLY_LICENSE_INSERT_ALLOWED'; END IF;
 _err:=false;
 BEGIN
   INSERT INTO public.renewals(id,client_id,partner_id,partner_uuid)
   VALUES('00000000-0000-4000-8000-000000000698',_a,
       '00000000-0000-4000-8000-000000000101',
       '00000000-0000-4000-8000-000000000101');
 EXCEPTION WHEN insufficient_privilege THEN _err:=true;
 END;
 IF NOT _err THEN RAISE EXCEPTION 'FIN02_NO_ACCESS_RENEWAL_INSERT_ALLOWED'; END IF;

 -- Partner Admin has Clients EDIT, Renewals VIEW. Existing controlled close
 -- remains a separate authorized SECURITY DEFINER path.
 PERFORM set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000003',true);
 IF NOT public.has_module_access('clients','edit')
 OR public.has_module_access('renewals','edit') THEN
   RAISE EXCEPTION 'FIN02_ADMIN_MODULE_TEMPLATE_DRIFT';
 END IF;
 UPDATE public.licenses SET notes=notes WHERE client_id=_a;
 GET DIAGNOSTICS _n=ROW_COUNT;
 IF _n<>1 THEN RAISE EXCEPTION 'FIN02_CLIENT_ADMIN_LICENSE_EDIT_DENIED'; END IF;
 UPDATE public.contracts SET observations=observations WHERE client_id=_a;
 GET DIAGNOSTICS _n=ROW_COUNT;
 IF _n<>1 THEN RAISE EXCEPTION 'FIN02_CLIENT_ADMIN_CONTRACT_EDIT_DENIED'; END IF;
 UPDATE public.renewals SET notes=notes WHERE client_id=_a;
 GET DIAGNOSTICS _n=ROW_COUNT;
 IF _n<>0 THEN RAISE EXCEPTION 'FIN02_RENEWALS_VIEW_GRANTS_DIRECT_EDIT'; END IF;

 -- Partner A Admin cannot modify anything owned by Partner B.
 UPDATE public.licenses SET notes=notes WHERE client_id=_b;
 GET DIAGNOSTICS _n=ROW_COUNT;
 IF _n<>0 THEN RAISE EXCEPTION 'FIN02_CROSS_PARTNER_LICENSE_WRITE'; END IF;
 UPDATE public.contracts SET observations=observations WHERE client_id=_b;
 GET DIAGNOSTICS _n=ROW_COUNT;
 IF _n<>0 THEN RAISE EXCEPTION 'FIN02_CROSS_PARTNER_CONTRACT_WRITE'; END IF;
 UPDATE public.renewals SET notes=notes WHERE client_id=_b;
 GET DIAGNOSTICS _n=ROW_COUNT;
 IF _n<>0 THEN RAISE EXCEPTION 'FIN02_CROSS_PARTNER_RENEWAL_WRITE'; END IF;

 -- HQ Standard has Clients EDIT and Renewals EDIT and retains authorized DML.
 PERFORM set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000002',true);
 UPDATE public.licenses SET notes=notes;
 GET DIAGNOSTICS _n=ROW_COUNT;
 IF _n<>2 THEN RAISE EXCEPTION 'FIN02_HQ_STANDARD_LICENSE_EDIT_REGRESSION'; END IF;
 UPDATE public.contracts SET observations=observations;
 GET DIAGNOSTICS _n=ROW_COUNT;
 IF _n<>2 THEN RAISE EXCEPTION 'FIN02_HQ_STANDARD_CONTRACT_EDIT_REGRESSION'; END IF;
 UPDATE public.renewals SET notes=notes;
 GET DIAGNOSTICS _n=ROW_COUNT;
 IF _n<>2 THEN RAISE EXCEPTION 'FIN02_HQ_STANDARD_RENEWAL_EDIT_REGRESSION'; END IF;

 -- HQ explicit Clients:VIEW override takes precedence for contract/license
 -- while Renewals module retains an independent EDIT authorization.
 PERFORM set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000007',true);
 UPDATE public.licenses SET notes=notes;
 GET DIAGNOSTICS _n=ROW_COUNT;
 IF _n<>0 THEN RAISE EXCEPTION 'FIN02_HQ_DOWNGRADED_LICENSE_BYPASS'; END IF;
 UPDATE public.contracts SET observations=observations;
 GET DIAGNOSTICS _n=ROW_COUNT;
 IF _n<>0 THEN RAISE EXCEPTION 'FIN02_HQ_DOWNGRADED_CONTRACT_BYPASS'; END IF;

 -- Probationary permissions remain restrictive.
 PERFORM set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000006',true);
 UPDATE public.licenses SET notes=notes WHERE client_id=_a;
 GET DIAGNOSTICS _n=ROW_COUNT;
 IF _n<>0 THEN RAISE EXCEPTION 'FIN02_PROBATIONARY_LICENSE_UPDATE'; END IF;
 UPDATE public.contracts SET observations=observations WHERE client_id=_a;
 GET DIAGNOSTICS _n=ROW_COUNT;
 IF _n<>0 THEN RAISE EXCEPTION 'FIN02_PROBATIONARY_CONTRACT_UPDATE'; END IF;
 UPDATE public.renewals SET notes=notes WHERE client_id=_a;
 GET DIAGNOSTICS _n=ROW_COUNT;
 IF _n<>0 THEN RAISE EXCEPTION 'FIN02_PROBATIONARY_RENEWAL_UPDATE'; END IF;
 RAISE NOTICE 'FIN02 LAB financial RLS edit candidate PASS: no Partner Sales direct writes across three tables; HQ/partner authorized client edits retained, renewals edit separately enforced; cross-tenant/probation denied';
END
$financial_candidate$;
ROLLBACK;
