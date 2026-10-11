-- Baseline TEST RLS known failure reproducible with strict canonical
-- client.partner_uuid and NULL legacy partner_id. This test ROLLS BACK.
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
DO $legacy_gap$
BEGIN
 IF (SELECT COUNT(*) FROM public.clients
  WHERE id='00000000-0000-4000-8000-000000000399')<>1
 OR (SELECT COUNT(*) FROM public.licenses
  WHERE id='00000000-0000-4000-8000-000000000899')<>0
 OR (SELECT COUNT(*) FROM public.renewals
  WHERE id='00000000-0000-4000-8000-000000000699')<>0
 OR (SELECT COUNT(*) FROM public.contracts
  WHERE id='00000000-0000-4000-8000-000000000299')<>0
 THEN RAISE EXCEPTION 'FIN02_SOURCE_EXACT_TEST_LEGACY_VISIBILITY_GAP_CHANGED'; END IF;
 RAISE NOTICE 'Gate3 real TEST RLS drift reproduced: own new partner_uuid-only client is visible but matching license and contract are hidden.';
END $legacy_gap$;
ROLLBACK;

