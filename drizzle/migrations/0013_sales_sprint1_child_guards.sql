-- manual_tasks has an HQ-wide bypass: add RESTRICTIVE guards so Direct-deal tasks follow the shared deal boundary.
CREATE OR REPLACE FUNCTION public.is_direct_deal_ref(_related_type text, _entity uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _entity IS NOT NULL
     AND COALESCE(_related_type, '') IN ('deal', 'pipeline', 'opportunity')
     AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id = _entity AND d.sales_engine IN ('new_business','account'))
$$;
REVOKE ALL ON FUNCTION public.is_direct_deal_ref(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_direct_deal_ref(text, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS manual_tasks_direct_scope_read ON public.manual_tasks;
CREATE POLICY manual_tasks_direct_scope_read ON public.manual_tasks AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT public.is_direct_deal_ref(related_type, related_entity_id) OR public.can_view_deal(related_entity_id));
DROP POLICY IF EXISTS manual_tasks_direct_scope_ins ON public.manual_tasks;
CREATE POLICY manual_tasks_direct_scope_ins ON public.manual_tasks AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_direct_deal_ref(related_type, related_entity_id) OR public.can_manage_deal(related_entity_id));
DROP POLICY IF EXISTS manual_tasks_direct_scope_upd ON public.manual_tasks;
CREATE POLICY manual_tasks_direct_scope_upd ON public.manual_tasks AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT public.is_direct_deal_ref(related_type, related_entity_id) OR public.can_manage_deal(related_entity_id))
  WITH CHECK (NOT public.is_direct_deal_ref(related_type, related_entity_id) OR public.can_manage_deal(related_entity_id));
DROP POLICY IF EXISTS manual_tasks_direct_scope_del ON public.manual_tasks;
CREATE POLICY manual_tasks_direct_scope_del ON public.manual_tasks AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT public.is_direct_deal_ref(related_type, related_entity_id) OR public.can_manage_deal(related_entity_id));

-- Direct closing interlock at the operationalization layer: no licence may be created from a Direct deal.
CREATE OR REPLACE FUNCTION public.guard_direct_license_from_deal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.deal_id IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.deal_id IS DISTINCT FROM NEW.deal_id)
     AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id = NEW.deal_id AND d.sales_engine = 'new_business') THEN
    RAISE EXCEPTION 'DIRECT_CLOSING_NOT_ENABLED: Direct Sales closing (Won / Award & Convert) is not enabled yet';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_direct_license_from_deal() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_direct_license_from_deal ON public.licenses;
CREATE TRIGGER trg_guard_direct_license_from_deal BEFORE INSERT OR UPDATE OF deal_id ON public.licenses
  FOR EACH ROW EXECUTE FUNCTION public.guard_direct_license_from_deal();