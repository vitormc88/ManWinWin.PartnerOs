
-- Fix deals INSERT: allow partner users to create deals for their own partner
DROP POLICY IF EXISTS deals_insert ON public.deals;
CREATE POLICY deals_insert ON public.deals FOR INSERT TO authenticated
WITH CHECK (
  is_hq_user(auth.uid())
  OR (
    partner_id IS NOT NULL
    AND (partner_id)::uuid = get_user_partner_id(auth.uid())
  )
);

-- Fix deals UPDATE: allow partner users to update their own partner's deals
DROP POLICY IF EXISTS deals_update ON public.deals;
CREATE POLICY deals_update ON public.deals FOR UPDATE TO authenticated
USING (
  is_hq_user(auth.uid())
  OR (partner_id IS NOT NULL AND (partner_id)::uuid = get_user_partner_id(auth.uid()))
)
WITH CHECK (
  is_hq_user(auth.uid())
  OR (partner_id IS NOT NULL AND (partner_id)::uuid = get_user_partner_id(auth.uid()))
);

-- Fix renewals INSERT: allow partner users to create renewals for their own partner
DROP POLICY IF EXISTS renewals_insert ON public.renewals;
CREATE POLICY renewals_insert ON public.renewals FOR INSERT TO authenticated
WITH CHECK (
  is_hq_user(auth.uid())
  OR (partner_id IS NOT NULL AND (partner_id)::uuid = get_user_partner_id(auth.uid()))
);

-- Fix renewals UPDATE: allow partner users
DROP POLICY IF EXISTS renewals_update ON public.renewals;
CREATE POLICY renewals_update ON public.renewals FOR UPDATE TO authenticated
USING (
  is_hq_user(auth.uid())
  OR (partner_id IS NOT NULL AND (partner_id)::uuid = get_user_partner_id(auth.uid()))
)
WITH CHECK (
  is_hq_user(auth.uid())
  OR (partner_id IS NOT NULL AND (partner_id)::uuid = get_user_partner_id(auth.uid()))
);

-- Fix clients INSERT: also allow partner users to create clients for their own partner
DROP POLICY IF EXISTS clients_insert ON public.clients;
CREATE POLICY clients_insert ON public.clients FOR INSERT TO authenticated
WITH CHECK (
  is_hq_user(auth.uid())
  OR (partner_id IS NOT NULL AND (partner_id)::uuid = get_user_partner_id(auth.uid()))
);

-- Fix clients UPDATE: also allow partner users to update their own partner's clients
DROP POLICY IF EXISTS clients_update ON public.clients;
CREATE POLICY clients_update ON public.clients FOR UPDATE TO authenticated
USING (
  is_hq_user(auth.uid())
  OR (partner_id IS NOT NULL AND (partner_id)::uuid = get_user_partner_id(auth.uid()))
)
WITH CHECK (
  is_hq_user(auth.uid())
  OR (partner_id IS NOT NULL AND (partner_id)::uuid = get_user_partner_id(auth.uid()))
);

-- Fix licenses INSERT: allow partner users for their own clients
DROP POLICY IF EXISTS licenses_insert ON public.licenses;
CREATE POLICY licenses_insert ON public.licenses FOR INSERT TO authenticated
WITH CHECK (
  is_hq_user(auth.uid())
  OR EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = licenses.client_id
      AND c.partner_id IS NOT NULL
      AND (c.partner_id)::uuid = get_user_partner_id(auth.uid())
  )
);

-- Fix licenses UPDATE
DROP POLICY IF EXISTS licenses_update ON public.licenses;
CREATE POLICY licenses_update ON public.licenses FOR UPDATE TO authenticated
USING (
  is_hq_user(auth.uid())
  OR EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = licenses.client_id
      AND c.partner_id IS NOT NULL
      AND (c.partner_id)::uuid = get_user_partner_id(auth.uid())
  )
)
WITH CHECK (
  is_hq_user(auth.uid())
  OR EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = licenses.client_id
      AND c.partner_id IS NOT NULL
      AND (c.partner_id)::uuid = get_user_partner_id(auth.uid())
  )
);

-- Fix contracts INSERT
DROP POLICY IF EXISTS contracts_insert ON public.contracts;
CREATE POLICY contracts_insert ON public.contracts FOR INSERT TO authenticated
WITH CHECK (
  is_hq_user(auth.uid())
  OR EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = contracts.client_id
      AND c.partner_id IS NOT NULL
      AND (c.partner_id)::uuid = get_user_partner_id(auth.uid())
  )
);

-- Fix contracts UPDATE
DROP POLICY IF EXISTS contracts_update ON public.contracts;
CREATE POLICY contracts_update ON public.contracts FOR UPDATE TO authenticated
USING (
  is_hq_user(auth.uid())
  OR EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = contracts.client_id
      AND c.partner_id IS NOT NULL
      AND (c.partner_id)::uuid = get_user_partner_id(auth.uid())
  )
)
WITH CHECK (
  is_hq_user(auth.uid())
  OR EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = contracts.client_id
      AND c.partner_id IS NOT NULL
      AND (c.partner_id)::uuid = get_user_partner_id(auth.uid())
  )
);
