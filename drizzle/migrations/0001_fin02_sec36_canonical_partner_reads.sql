SET LOCAL lock_timeout = '5s';
LOCK TABLE public.contracts, public.licenses, public.renewals IN ACCESS EXCLUSIVE MODE;
DO $fin02_preflight$
DECLARE r record; actual text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('contracts','contracts_select','f78a701cb6e66f7e8c29530600f85bb0'),
    ('licenses','licenses_select','bfebb8436f0634b4bc6bd8ae92d2853a'),
    ('renewals','renewals_select','40304077653ef7169e090d523da6d341')
  ) expected(tab, policy, original_hash) LOOP
    SELECT CASE WHEN permissive='PERMISSIVE' AND cmd=upper(split_part(r.policy,'_',2))
      AND roles::text[]=ARRAY['authenticated']::text[]
      THEN md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) ELSE NULL END
      INTO actual FROM pg_policies
      WHERE schemaname='public' AND tablename=r.tab AND policyname=r.policy;
    IF actual IS DISTINCT FROM r.original_hash THEN
      RAISE EXCEPTION 'FIN02_SEC36_BASELINE_DRIFT: %.% expected % got %',
        r.tab,r.policy,r.original_hash,coalesce(actual,'MISSING');
    END IF;
  END LOOP;
END
$fin02_preflight$;

ALTER POLICY licenses_select ON public.licenses USING (public.is_hq_user(auth.uid()) OR EXISTS (
 SELECT 1 FROM public.clients c WHERE c.id=licenses.client_id AND (
   (c.partner_uuid IS NOT NULL AND public.can_view_partner(c.partner_uuid))
   OR (c.partner_uuid IS NULL AND c.partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       AND public.can_view_partner((CASE WHEN c.partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN c.partner_id::uuid ELSE NULL::uuid END)))
 )
));
ALTER POLICY contracts_select ON public.contracts USING (public.is_hq_user(auth.uid()) OR EXISTS (
 SELECT 1 FROM public.clients c WHERE c.id=contracts.client_id AND (
   (c.partner_uuid IS NOT NULL AND public.can_view_partner(c.partner_uuid))
   OR (c.partner_uuid IS NULL AND c.partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       AND public.can_view_partner((CASE WHEN c.partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN c.partner_id::uuid ELSE NULL::uuid END)))
 )
));
ALTER POLICY renewals_select ON public.renewals USING (public.is_hq_user(auth.uid()) OR
 (partner_uuid IS NOT NULL AND public.can_view_partner(partner_uuid)) OR
 (partner_uuid IS NULL AND partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND public.can_view_partner((CASE WHEN partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN partner_id::uuid ELSE NULL::uuid END))));