-- FIN02 evaluate LAB-ONLY candidate for Clients write permission.
-- The baseline genuine TEST RLS gap must be demonstrated FIRST.
-- This is not authorization to deploy the policy change.
BEGIN;
SET LOCAL ROLE authenticated;
DO $candidate$
DECLARE
  _n integer;
  _rejected boolean;
  _a uuid := '00000000-0000-4000-8000-000000000301';
  _b uuid := '00000000-0000-4000-8000-000000000302';
BEGIN
  -- Partner Sales has clients:view and lacks clients:edit.
  PERFORM set_config('request.jwt.claim.sub',
    '00000000-0000-4000-8000-000000000004',true);
  IF NOT public.has_module_access('clients','view')
     OR public.has_module_access('clients','edit') THEN
    RAISE EXCEPTION 'FIN02_PERMISSION_TEMPLATE_DRIFT';
  END IF;
  UPDATE public.clients SET commercial_name=commercial_name WHERE id=_a;
  GET DIAGNOSTICS _n=ROW_COUNT;
  IF _n<>0 THEN RAISE EXCEPTION 'FIN02_VIEW_ONLY_CLIENT_UPDATE_NOT_BLOCKED'; END IF;
  _rejected:=false;
  BEGIN
    INSERT INTO public.clients(id,client_code,commercial_name,partner_id,partner_uuid)
    VALUES ('00000000-0000-4000-8000-000000000303','LAB_VIEW_INSERT_DENIED',
    'Synthetic forbidden','00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000101');
  EXCEPTION WHEN insufficient_privilege THEN _rejected:=true;
  END;
  IF NOT _rejected THEN
    RAISE EXCEPTION 'FIN02_VIEW_ONLY_CLIENT_INSERT_NOT_BLOCKED';
  END IF;

  -- Partner A admin has clients:edit and can update ONLY own customer.
  PERFORM set_config('request.jwt.claim.sub',
    '00000000-0000-4000-8000-000000000003',true);
  IF NOT public.has_module_access('clients','edit') THEN
    RAISE EXCEPTION 'FIN02_PARTNER_ADMIN_EDIT_PERMISSION_MISSING';
  END IF;
  UPDATE public.clients SET commercial_name=commercial_name WHERE id=_a;
  GET DIAGNOSTICS _n=ROW_COUNT;
  IF _n<>1 THEN RAISE EXCEPTION 'FIN02_PARTNER_ADMIN_EDIT_INCORRECT'; END IF;
  UPDATE public.clients SET commercial_name=commercial_name WHERE id=_b;
  GET DIAGNOSTICS _n=ROW_COUNT;
  IF _n<>0 THEN RAISE EXCEPTION 'FIN02_PARTNER_ADMIN_TENANT_ISOLATION_BROKEN'; END IF;

  -- HQ standard has clients:edit and still legitimately manages clients.
  PERFORM set_config('request.jwt.claim.sub',
    '00000000-0000-4000-8000-000000000002',true);
  UPDATE public.clients SET commercial_name=commercial_name;
  GET DIAGNOSTICS _n=ROW_COUNT;
  IF _n<>2 THEN RAISE EXCEPTION 'FIN02_HQ_STANDARD_CLIENT_EDIT_REGRESSION'; END IF;

  -- An HQ Standard with explicit effective clients:view downgrade must
  -- NOT be able to bypass the per-user module override.
  PERFORM set_config('request.jwt.claim.sub',
    '00000000-0000-4000-8000-000000000007',true);
  IF NOT public.has_module_access('clients','view')
     OR public.has_module_access('clients','edit') THEN
    RAISE EXCEPTION 'FIN02_HQ_OVERRIDE_TEST_PRECONDITION_FAILED';
  END IF;
  UPDATE public.clients SET commercial_name=commercial_name;
  GET DIAGNOSTICS _n=ROW_COUNT;
  IF _n<>0 THEN RAISE EXCEPTION 'FIN02_HQ_VIEW_ONLY_OVERRIDE_WRITE_ALLOWED'; END IF;

  -- Probationary connector still has no access.
  PERFORM set_config('request.jwt.claim.sub',
    '00000000-0000-4000-8000-000000000006',true);
  UPDATE public.clients SET commercial_name=commercial_name WHERE id=_a;
  GET DIAGNOSTICS _n=ROW_COUNT;
  IF _n<>0 THEN RAISE EXCEPTION 'FIN02_PROBATIONARY_CLIENT_UPDATE_REGRESSION'; END IF;

  RAISE NOTICE 'FIN02 LAB-ONLY RLS corrective candidate PASS: clients:view cannot INSERT/UPDATE, clients:edit permitted for own partner/HQ; cross-tenant and probationary denied.';
END
$candidate$;
ROLLBACK;
