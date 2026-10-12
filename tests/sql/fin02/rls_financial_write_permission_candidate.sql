-- FIN02 SECURITY ONLY: LAB-ONLY candidate for TEST financial write RLS.
-- NEVER apply to live TEST/PROD without authorization, full trigger/RPC review
-- and verified rollback. PROD read-only policy inspection used as direction.
-- Own-partner ownership alone is NOT sufficient for financial table edits.

ALTER POLICY licenses_insert ON public.licenses
  WITH CHECK (public.can_manage_client(client_id));
ALTER POLICY licenses_update ON public.licenses
  USING (public.can_manage_client(client_id))
  WITH CHECK (public.can_manage_client(client_id));

ALTER POLICY contracts_insert ON public.contracts
  WITH CHECK (public.can_manage_client(client_id));
ALTER POLICY contracts_update ON public.contracts
  USING (public.can_manage_client(client_id))
  WITH CHECK (public.can_manage_client(client_id));

-- Preserve valid legacy TEST partner associations while moving new records to
-- canonical partner_uuid. Module edit is mandatory for direct DML; partner
-- admin's controlled SECURITY DEFINER close_renewal is tested separately.
ALTER POLICY renewals_insert ON public.renewals
  WITH CHECK (
    public.has_module_access('renewals','edit') AND (
      public.is_hq_user(auth.uid())
      OR partner_uuid=public.get_user_partner_id(auth.uid())
      OR (partner_uuid IS NULL
          AND partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND partner_id::uuid=public.get_user_partner_id(auth.uid()))
    )
  );
ALTER POLICY renewals_update ON public.renewals
  USING (
    public.has_module_access('renewals','edit') AND (
      public.is_hq_user(auth.uid())
      OR partner_uuid=public.get_user_partner_id(auth.uid())
      OR (partner_uuid IS NULL
          AND partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND partner_id::uuid=public.get_user_partner_id(auth.uid()))
    )
  )
  WITH CHECK (
    public.has_module_access('renewals','edit') AND (
      public.is_hq_user(auth.uid())
      OR partner_uuid=public.get_user_partner_id(auth.uid())
      OR (partner_uuid IS NULL
          AND partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$'
          AND partner_id::uuid=public.get_user_partner_id(auth.uid()))
    )
  );
