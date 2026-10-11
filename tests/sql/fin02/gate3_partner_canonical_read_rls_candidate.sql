-- FIN02 Gate3 LAB-ONLY fix candidate, NOT for TEST deployment.
-- Current TEST licenses_select/contracts_select depend solely on legacy
-- clients.partner_id; actual award RPC writes canonical partner_uuid only.
-- Keep HQ behavior and same-partner/manager check via can_view_partner.
-- Use a validated fallback so arbitrary historical text cannot be ::uuid.
ALTER POLICY licenses_select ON public.licenses USING (
 public.is_hq_user(auth.uid())
 OR EXISTS (
   SELECT 1 FROM public.clients c
   WHERE c.id = licenses.client_id
     AND (
       (c.partner_uuid IS NOT NULL
        AND public.can_view_partner(c.partner_uuid))
       OR (c.partner_uuid IS NULL
          AND c.partner_id IS NOT NULL
          AND c.partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND public.can_view_partner(c.partner_id::uuid))
     )
 )
);
ALTER POLICY contracts_select ON public.contracts USING (
 public.is_hq_user(auth.uid())
 OR EXISTS (
   SELECT 1 FROM public.clients c
   WHERE c.id = contracts.client_id
     AND (
       (c.partner_uuid IS NOT NULL
        AND public.can_view_partner(c.partner_uuid))
       OR (c.partner_uuid IS NULL
          AND c.partner_id IS NOT NULL
          AND c.partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND public.can_view_partner(c.partner_id::uuid))
     )
 )
);
