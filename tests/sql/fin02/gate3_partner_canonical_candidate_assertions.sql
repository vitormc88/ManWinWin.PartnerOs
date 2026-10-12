-- After the candidate is applied, test same synthetic canonical client
-- and verify own partner sees assets, other partner cannot.
BEGIN;
INSERT INTO public.clients(id,client_code,commercial_name,partner_uuid)
VALUES ('00000000-0000-4000-8000-000000000399','GATE3_ONLY_UUID',
  'Synthetic Canonical Partner', '00000000-0000-4000-8000-000000000101');
INSERT INTO public.contracts(id,client_id)
VALUES ('00000000-0000-4000-8000-000000000299',
  '00000000-0000-4000-8000-000000000399');
INSERT INTO public.licenses(id,client_id,contract_id)
VALUES ('00000000-0000-4000-8000-000000000899',
  '00000000-0000-4000-8000-000000000399',
  '00000000-0000-4000-8000-000000000299');
INSERT INTO public.renewals (id,client_id,contract_id,license_id,partner_uuid)
VALUES ('00000000-0000-4000-8000-000000000699',
        '00000000-0000-4000-8000-000000000399',
        '00000000-0000-4000-8000-000000000299',
        '00000000-0000-4000-8000-000000000899',
        '00000000-0000-4000-8000-000000000101');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000003',true);
DO $canonical_fix$
BEGIN
 IF (SELECT COUNT(*) FROM public.renewals
     WHERE id='00000000-0000-4000-8000-000000000699')<>1 OR
    (SELECT COUNT(*) FROM public.licenses
     WHERE id='00000000-0000-4000-8000-000000000899')<>1 OR
    (SELECT COUNT(*) FROM public.contracts
     WHERE id='00000000-0000-4000-8000-000000000299')<>1
 THEN RAISE EXCEPTION 'FIN02_CANDIDATE_CANONICAL_PARTNER_READ_MISSING'; END IF;
 PERFORM set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000005',true);
 IF (SELECT COUNT(*) FROM public.renewals
     WHERE id='00000000-0000-4000-8000-000000000699')<>0 OR
    (SELECT COUNT(*) FROM public.licenses
     WHERE id='00000000-0000-4000-8000-000000000899')<>0 OR
    (SELECT COUNT(*) FROM public.contracts
     WHERE id='00000000-0000-4000-8000-000000000299')<>0
 THEN RAISE EXCEPTION 'FIN02_CANDIDATE_CROSS_PARTNER_DATA_LEAK'; END IF;
 RAISE NOTICE 'Gate3 canonical partner visibility candidate PASS: own license+contract+renewal visible and other partner denied.';
END $canonical_fix$;
ROLLBACK;
