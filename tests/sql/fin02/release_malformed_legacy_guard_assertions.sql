-- FIN02 SEC35+SEC36+SEC38: malformed historical clients.partner_id
-- must fail CLOSED without throwing invalid UUID cast during RLS checks.
-- Entire synthetic fixture rolled back; no user/business data.
BEGIN;
INSERT INTO public.clients (id,client_code,commercial_name,partner_id,partner_uuid)
VALUES ('00000000-0000-4000-8000-000000000398',
  'GATE3_MALFORMED_LEGACY','Synthetic invalid legacy partner','bad-legacy-id',NULL);
INSERT INTO public.contracts(id,client_id)
VALUES ('00000000-0000-4000-8000-000000000297',
 '00000000-0000-4000-8000-000000000398');
INSERT INTO public.licenses(id,client_id,contract_id)
VALUES ('00000000-0000-4000-8000-000000000897',
 '00000000-0000-4000-8000-000000000398',
 '00000000-0000-4000-8000-000000000297');
INSERT INTO public.renewals(id,client_id,contract_id,license_id,partner_id)
VALUES ('00000000-0000-4000-8000-000000000697',
 '00000000-0000-4000-8000-000000000398',
 '00000000-0000-4000-8000-000000000297',
 '00000000-0000-4000-8000-000000000897','bad-legacy-id');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000003',true);
DO $legacy_malformed$
DECLARE
  n int; denied boolean:=false;
BEGIN
 SELECT COUNT(*) INTO n FROM public.clients
 WHERE id='00000000-0000-4000-8000-000000000398';
 IF n<>0 THEN RAISE EXCEPTION 'FIN02_BAD_LEGACY_CLIENT_VISIBLE'; END IF;
 SELECT COUNT(*) INTO n FROM public.licenses
 WHERE id='00000000-0000-4000-8000-000000000897';
 IF n<>0 THEN RAISE EXCEPTION 'FIN02_BAD_LEGACY_LICENSE_VISIBLE'; END IF;
 SELECT COUNT(*) INTO n FROM public.contracts
 WHERE id='00000000-0000-4000-8000-000000000297';
 IF n<>0 THEN RAISE EXCEPTION 'FIN02_BAD_LEGACY_CONTRACT_VISIBLE'; END IF;
 SELECT COUNT(*) INTO n FROM public.renewals
 WHERE id='00000000-0000-4000-8000-000000000697';
 IF n<>0 THEN RAISE EXCEPTION 'FIN02_BAD_LEGACY_RENEWAL_VISIBLE'; END IF;
 UPDATE public.renewals SET notes=notes
 WHERE id='00000000-0000-4000-8000-000000000697';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'FIN02_BAD_LEGACY_RENEWAL_WRITABLE'; END IF;
 BEGIN
  INSERT INTO public.clients(id,client_code,commercial_name,partner_id)
  VALUES ('00000000-0000-4000-8000-000000000397',
    'GATE3_BAD_LEGACY_INSERT','Synthetic denied','bad-legacy-id');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'FIN02_BAD_LEGACY_CLIENT_INSERT_ALLOWED'; END IF;
 RAISE NOTICE 'FIN02 invalid legacy partner IDs: no cast exceptions, no SELECT/UPDATE/INSERT bypass for unaffiliated roles.';
END $legacy_malformed$;
ROLLBACK;
