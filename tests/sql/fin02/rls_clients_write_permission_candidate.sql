-- FIN02 TEST-only DRAFT RLS candidate. Never apply to live TEST or PROD.
-- Intended corrective delta: restrict existing clients INSERT and UPDATE
-- policies by the effective 'clients:edit' module permission. Preserve all
-- existing partner ownership constraints and probationary restrictions.
-- The PROD implementation is similar but not identical; this avoids
-- accidentally breaking TEST's legacy partner_id behavior.
ALTER POLICY clients_insert ON public.clients
WITH CHECK (
  public.has_module_access('clients','edit')
  AND (
    public.is_hq_user(auth.uid())
    OR (
      partner_id IS NOT NULL AND partner_id::uuid =
      public.get_user_partner_id(auth.uid())
    )
  )
);

ALTER POLICY clients_update ON public.clients
USING (
  public.has_module_access('clients','edit')
  AND (
    public.is_hq_user(auth.uid())
    OR (
      partner_id IS NOT NULL AND partner_id::uuid =
      public.get_user_partner_id(auth.uid())
    )
  )
)
WITH CHECK (
  public.has_module_access('clients','edit')
  AND (
    public.is_hq_user(auth.uid())
    OR (
      partner_id IS NOT NULL AND partner_id::uuid =
      public.get_user_partner_id(auth.uid())
    )
  )
);
