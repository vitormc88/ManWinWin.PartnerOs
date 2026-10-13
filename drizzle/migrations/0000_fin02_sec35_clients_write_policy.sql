SET LOCAL lock_timeout = '5s';
LOCK TABLE public.clients IN ACCESS EXCLUSIVE MODE;
DO $fin02_preflight$
DECLARE r record; actual text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('clients','clients_insert','d7a91f1c156083c1b180f67150ac937d'),
    ('clients','clients_update','9c6212431a65fefd979fb4d126457188')
  ) expected(tab, policy, original_hash) LOOP
    SELECT CASE WHEN permissive='PERMISSIVE' AND cmd=upper(split_part(r.policy,'_',2))
      AND roles::text[]=ARRAY['authenticated']::text[]
      THEN md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) ELSE NULL END
      INTO actual FROM pg_policies
      WHERE schemaname='public' AND tablename=r.tab AND policyname=r.policy;
    IF actual IS DISTINCT FROM r.original_hash THEN
      RAISE EXCEPTION 'FIN02_SEC35_BASELINE_DRIFT: %.% expected % got %',
        r.tab,r.policy,r.original_hash,coalesce(actual,'MISSING');
    END IF;
  END LOOP;
END
$fin02_preflight$;

ALTER POLICY clients_insert ON public.clients WITH CHECK (
  public.has_module_access('clients','edit') AND (public.is_hq_user(auth.uid()) OR (
      partner_uuid IS NOT NULL AND partner_uuid=public.get_user_partner_id(auth.uid())
    ) OR (
      partner_uuid IS NULL AND partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND (CASE WHEN partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN partner_id::uuid ELSE NULL::uuid END)=public.get_user_partner_id(auth.uid())
    ))
);
ALTER POLICY clients_update ON public.clients
  USING (public.has_module_access('clients','edit') AND (public.is_hq_user(auth.uid()) OR (
      partner_uuid IS NOT NULL AND partner_uuid=public.get_user_partner_id(auth.uid())
    ) OR (
      partner_uuid IS NULL AND partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND (CASE WHEN partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN partner_id::uuid ELSE NULL::uuid END)=public.get_user_partner_id(auth.uid())
    )))
  WITH CHECK (public.has_module_access('clients','edit') AND (public.is_hq_user(auth.uid()) OR (
      partner_uuid IS NOT NULL AND partner_uuid=public.get_user_partner_id(auth.uid())
    ) OR (
      partner_uuid IS NULL AND partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND (CASE WHEN partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN partner_id::uuid ELSE NULL::uuid END)=public.get_user_partner_id(auth.uid())
    )));