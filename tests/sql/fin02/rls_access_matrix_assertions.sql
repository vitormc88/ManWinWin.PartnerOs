-- FIN02 Gate2B: exact TEST RLS policies and helper bodies, fake JWT-claim
-- identity, role template values copied from TEST; all rows synthetic.
-- Never execute on a live database.
BEGIN;
SET LOCAL ROLE authenticated;
DO $fin02_rls_cases$
DECLARE
  _who uuid;
  _t text;
  _count integer;
  _expected integer;
  _row_count integer;
  _client_a uuid := '00000000-0000-4000-8000-000000000301';
  _client_b uuid := '00000000-0000-4000-8000-000000000302';
  _partner_a uuid := '00000000-0000-4000-8000-000000000101';
BEGIN
  -- Test roles: HQ Admin, HQ Standard, Partner Admin A, Partner Sales A,
  -- Partner Admin B, and Probationary Partner A.
  FOR _who IN SELECT id FROM (VALUES
    ('00000000-0000-4000-8000-000000000001'::uuid),
    ('00000000-0000-4000-8000-000000000002'::uuid),
    ('00000000-0000-4000-8000-000000000003'::uuid),
    ('00000000-0000-4000-8000-000000000004'::uuid),
    ('00000000-0000-4000-8000-000000000005'::uuid),
    ('00000000-0000-4000-8000-000000000006'::uuid)
  ) actors(id)
  LOOP
    PERFORM set_config('request.jwt.claim.sub',_who::text,true);
    IF auth.uid() IS DISTINCT FROM _who THEN
      RAISE EXCEPTION 'FIN02_IDENTITY_CLAIM_NOT_SET_FOR_%', _who;
    END IF;

    FOREACH _t IN ARRAY ARRAY[
      'clients','deals','proposals','proposal_items',
      'contracts','contract_lines','licenses','renewals'
    ] LOOP
      EXECUTE format('SELECT count(*) FROM public.%I',_t) INTO _count;
      _expected := CASE
        WHEN _who IN (
          '00000000-0000-4000-8000-000000000001'::uuid,
          '00000000-0000-4000-8000-000000000002'::uuid
        ) THEN 2
        WHEN _who = '00000000-0000-4000-8000-000000000006'::uuid THEN 0
        ELSE 1 END;
      IF _count <> _expected THEN
        RAISE EXCEPTION 'FIN02_RLS_VISIBILITY_%, ACTOR_%, expected_%, found_%',
          _t,_who,_expected,_count;
      END IF;
    END LOOP;

    IF _who IN (
      '00000000-0000-4000-8000-000000000003'::uuid,
      '00000000-0000-4000-8000-000000000004'::uuid
    ) THEN
      IF (SELECT count(*) FROM public.clients WHERE id=_client_b) <> 0
          OR (SELECT count(*) FROM public.clients WHERE id=_client_a) <> 1 THEN
        RAISE EXCEPTION 'FIN02_PARTNER_A_CROSS_TENANT_READ';
      END IF;
    END IF;
    IF _who = '00000000-0000-4000-8000-000000000005'::uuid THEN
      IF (SELECT count(*) FROM public.clients WHERE id=_client_a) <> 0
          OR (SELECT count(*) FROM public.clients WHERE id=_client_b) <> 1 THEN
        RAISE EXCEPTION 'FIN02_PARTNER_B_CROSS_TENANT_READ';
      END IF;
    END IF;
  END LOOP;

  -- Partner A cannot UPDATE an unrelated client, even via direct table DML.
  PERFORM set_config('request.jwt.claim.sub',
    '00000000-0000-4000-8000-000000000003',true);
  UPDATE public.clients SET commercial_name=commercial_name WHERE id=_client_b;
  GET DIAGNOSTICS _row_count = ROW_COUNT;
  IF _row_count <> 0 THEN
    RAISE EXCEPTION 'FIN02_UNAUTHORIZED_CROSS_PARTNER_CLIENT_UPDATE';
  END IF;

  -- Actual TEST RLS unexpectedly permits same-partner client update for a
  -- partner_sales role, despite template client permission VIEW.
  -- Demonstrate and RECORD this risk; do not rewrite live TEST privileges.
  PERFORM set_config('request.jwt.claim.sub',
    '00000000-0000-4000-8000-000000000004',true);
  IF NOT public.has_module_access('clients','view')
     OR public.has_module_access('clients','edit') THEN
    RAISE EXCEPTION 'FIN02_SYNTHETIC_PARTNER_SALES_TEMPLATE_DRIFT';
  END IF;
  UPDATE public.clients SET commercial_name=commercial_name WHERE id=_client_a;
  GET DIAGNOSTICS _row_count = ROW_COUNT;
  IF _row_count <> 1 THEN
    RAISE EXCEPTION 'FIN02_TEST_CLIENT_UPDATE_POLICY_BEHAVIOR_DRIFT';
  END IF;
  RAISE NOTICE 'FIN02 SECURITY GAP CONFIRMED BY SOURCE-EXACT TEST RLS: partner_sales (clients:view) can UPDATE own client using direct DML. Requires separate remediation decision.';

  -- TEST clients_insert also omits the clients:edit module threshold.
  INSERT INTO public.clients(id,client_code,commercial_name,partner_id,partner_uuid)
    VALUES ('00000000-0000-4000-8000-000000000303',
            'FIN02_TEST_VIEW_ONLY_INSERT','Synthetic unauthorized new client',
            '00000000-0000-4000-8000-000000000101',_partner_a);
  GET DIAGNOSTICS _row_count = ROW_COUNT;
  IF _row_count <> 1 THEN
    RAISE EXCEPTION 'FIN02_TEST_CLIENT_INSERT_POLICY_BEHAVIOR_DRIFT';
  END IF;
  RAISE NOTICE 'FIN02 SECURITY GAP: partner_sales (clients:view) can also INSERT a new client using direct DML under current TEST policy.';

  -- Read-only Partner Sales is also subject to financial table access
  -- controls. Existing TEST table grants + exact license/contract/renewal
  -- RLS permit direct no-op UPDATE for its own LEGACY-partner client despite
  -- clients:view and renewals:no_access. Do not equate this scoped RLS
  -- behavior with complete live-trigger/HTTP permissions.
  IF public.has_module_access('renewals','view') THEN
    RAISE EXCEPTION 'FIN02_PARTNER_SALES_RENEWALS_TEMPLATE_DRIFT';
  END IF;
  UPDATE public.licenses SET notes=notes WHERE client_id=_client_a;
  GET DIAGNOSTICS _row_count=ROW_COUNT;
  IF _row_count<>1 THEN RAISE EXCEPTION 'FIN02_LEGACY_LICENSE_WRITE_POLICY_BEHAVIOR_DRIFT'; END IF;
  UPDATE public.contracts SET observations=observations WHERE client_id=_client_a;
  GET DIAGNOSTICS _row_count=ROW_COUNT;
  IF _row_count<>1 THEN RAISE EXCEPTION 'FIN02_LEGACY_CONTRACT_WRITE_POLICY_BEHAVIOR_DRIFT'; END IF;
  UPDATE public.renewals SET notes=notes WHERE client_id=_client_a;
  GET DIAGNOSTICS _row_count=ROW_COUNT;
  IF _row_count<>1 THEN RAISE EXCEPTION 'FIN02_LEGACY_RENEWAL_WRITE_POLICY_BEHAVIOR_DRIFT'; END IF;
  UPDATE public.licenses SET notes=notes WHERE client_id=_client_b;
  GET DIAGNOSTICS _row_count=ROW_COUNT;
  IF _row_count<>0 THEN RAISE EXCEPTION 'FIN02_CROSS_PARTNER_LICENSE_UPDATE'; END IF;
  UPDATE public.contracts SET observations=observations WHERE client_id=_client_b;
  GET DIAGNOSTICS _row_count=ROW_COUNT;
  IF _row_count<>0 THEN RAISE EXCEPTION 'FIN02_CROSS_PARTNER_CONTRACT_UPDATE'; END IF;
  UPDATE public.renewals SET notes=notes WHERE client_id=_client_b;
  GET DIAGNOSTICS _row_count=ROW_COUNT;
  IF _row_count<>0 THEN RAISE EXCEPTION 'FIN02_CROSS_PARTNER_RENEWAL_UPDATE'; END IF;
  RAISE NOTICE 'FIN02 RLS SECURITY GAP: partner_sales (clients:view, renewals:no_access) can directly UPDATE OWN legacy-partner License, Contract and Renewal rows under original TEST policies; cross-partner denied. Further full-trigger test required.';

  -- TEST also ignores per-user override: an HQ Standard whose effective
  -- Clients permission was reduced from EDIT to VIEW can still UPDATE.
  PERFORM set_config('request.jwt.claim.sub',
    '00000000-0000-4000-8000-000000000007',true);
  IF NOT public.has_module_access('clients','view')
     OR public.has_module_access('clients','edit') THEN
    RAISE EXCEPTION 'FIN02_SYNTHETIC_HQ_OVERRIDE_NOT_EFFECTIVE';
  END IF;
  UPDATE public.clients SET commercial_name=commercial_name;
  GET DIAGNOSTICS _row_count=ROW_COUNT;
  -- Three rows now exist inside this rollback-only transaction because
  -- Partner Sales just proved the unauthorized third-client INSERT.
  IF _row_count<>3 THEN
    RAISE EXCEPTION 'FIN02_TEST_HQ_OVERRIDE_WRITE_BEHAVIOR_DRIFT';
  END IF;
  RAISE NOTICE 'FIN02 SECURITY GAP: TEST clients_update ignores module view-only override on HQ Standard.';

  -- A probate partner cannot view contracts either: contract policy
  -- checks clients via an invoker subquery, and the RESTRICTIVE client RLS
  -- prevents visibility. This is a correct chained RLS behavior.
  PERFORM set_config('request.jwt.claim.sub',
    '00000000-0000-4000-8000-000000000006',true);
  IF NOT public.pg_is_probationary_partner() THEN
    RAISE EXCEPTION 'FIN02_PROBATIONARY_IDENTITY_NOT_RECOGNIZED';
  END IF;
  IF (SELECT count(*) FROM public.contracts) <> 0
      OR (SELECT count(*) FROM public.clients) <> 0 THEN
    RAISE EXCEPTION 'FIN02_PROBATIONARY_TEST_RLS_POLICY_BEHAVIOR_DRIFT';
  END IF;
  RAISE NOTICE 'FIN02 probationary restriction confirmed across client-linked contracts by nested client RLS; no false-positive contract exposure.';

  -- No unrelated partner's contract visible to probationary account.
  IF (SELECT count(*) FROM public.contracts WHERE client_id=_client_b) <> 0 THEN
    RAISE EXCEPTION 'FIN02_PROBATIONARY_CROSS_PARTNER_CONTRACT_READ';
  END IF;
END
$fin02_rls_cases$;
ROLLBACK;

-- Anon has no financial policy grants. Even where table GRANT SELECT exists,
-- RLS denies every row for anon because all eight policies target authenticated.
BEGIN;
SET LOCAL ROLE anon;
DO $fin02_anon$
DECLARE
  _t text;
  _n integer;
BEGIN
  FOREACH _t IN ARRAY ARRAY['clients','deals','contracts','contract_lines','licenses','renewals'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I',_t) INTO _n;
    IF _n <> 0 THEN RAISE EXCEPTION 'FIN02_ANON_FINANCIAL_VISIBILITY: %, %',_t,_n; END IF;
  END LOOP;
END
$fin02_anon$;
ROLLBACK;
