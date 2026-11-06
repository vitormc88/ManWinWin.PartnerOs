-- Rollback for 20261106140000_sales_s1_commercial_scope.sql (REVIEW-ONLY).
-- Restores the exact pre-Sprint-1 deal policies/helpers. Refuses if any
-- deal has been classified, so classification data is never silently lost.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.deals WHERE sales_engine IS NOT NULL OR partner_uuid IS NOT NULL) THEN
    RAISE EXCEPTION 'ROLLBACK_REFUSED: classified deals exist; review before dropping columns';
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_proposals_block_direct_won ON public.proposals;
DROP TRIGGER IF EXISTS trg_licenses_block_direct ON public.licenses;
DROP TRIGGER IF EXISTS trg_deals_block_direct_closing ON public.deals;
DROP TRIGGER IF EXISTS trg_deals_guard_commercial_scope ON public.deals;
DROP POLICY IF EXISTS manual_tasks_direct_scope_read ON public.manual_tasks;
DROP POLICY IF EXISTS manual_tasks_direct_scope_write ON public.manual_tasks;

DROP POLICY IF EXISTS deals_select ON public.deals;
CREATE POLICY deals_select ON public.deals FOR SELECT TO authenticated
  USING (public.is_hq_user(auth.uid()) OR (partner_id IS NOT NULL AND public.can_view_partner(partner_id::uuid)));
DROP POLICY IF EXISTS deals_insert ON public.deals;
CREATE POLICY deals_insert ON public.deals FOR INSERT TO authenticated
  WITH CHECK (public.is_hq_user(auth.uid()) OR (partner_id IS NOT NULL AND partner_id::uuid = public.get_user_partner_id(auth.uid())));
DROP POLICY IF EXISTS deals_update ON public.deals;
CREATE POLICY deals_update ON public.deals FOR UPDATE TO authenticated
  USING (public.is_hq_user(auth.uid()) OR (partner_id IS NOT NULL AND partner_id::uuid = public.get_user_partner_id(auth.uid())))
  WITH CHECK (public.is_hq_user(auth.uid()) OR (partner_id IS NOT NULL AND partner_id::uuid = public.get_user_partner_id(auth.uid())));
DROP POLICY IF EXISTS deals_delete ON public.deals;
CREATE POLICY deals_delete ON public.deals FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'hq_admin'));

CREATE OR REPLACE FUNCTION public.can_view_deal(_deal_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from public.deals d where d.id = _deal_id
    and (public.is_hq_user(auth.uid()) or (d.partner_id is not null and public.can_view_partner(d.partner_id::uuid))))
$$;
CREATE OR REPLACE FUNCTION public.can_manage_deal(_deal_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from public.deals d where d.id = _deal_id
    and (public.is_hq_user(auth.uid()) or (d.partner_id is not null and d.partner_id::uuid = public.get_user_partner_id(auth.uid()))))
$$;

DROP FUNCTION IF EXISTS public.block_direct_deal_operationalization();
DROP FUNCTION IF EXISTS public.deals_block_direct_closing();
DROP FUNCTION IF EXISTS public.deals_guard_commercial_scope();
DROP FUNCTION IF EXISTS public.is_direct_deal_ref(text, uuid);
DROP FUNCTION IF EXISTS public.deal_row_access(text, text, uuid, text);
DROP FUNCTION IF EXISTS public.direct_deal_access(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.is_active_hq_user(uuid);

DELETE FROM public.role_permission_templates WHERE module_key = 'sales';
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_direct_has_no_partner;
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_partner_uuid_matches_legacy;
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_sales_engine_check;
DROP INDEX IF EXISTS public.deals_sales_engine_assigned_idx;
DROP INDEX IF EXISTS public.deals_partner_uuid_idx;
ALTER TABLE public.deals DROP COLUMN IF EXISTS partner_uuid;
ALTER TABLE public.deals DROP COLUMN IF EXISTS sales_engine;
COMMIT;
